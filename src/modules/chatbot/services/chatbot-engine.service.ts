import type { Prisma } from "@prisma/client";
import { CepRepository } from "@/repositories/cep.repository";
import { ChatbotRepository } from "@/repositories/chatbot.repository";
import { OpenAiService } from "@/services/openai/openai.service";
import type { ExtractedCustomerData } from "@/services/openai/openai.service";
import { ZapiService } from "@/services/zapi/zapi.service";
import { onlyDigits } from "@/utils/mask";

const VALID_BILLING_DAYS = [5, 8, 10, 15, 20, 25];

export class ChatbotEngineService {
  constructor(
    private readonly cepRepository = new CepRepository(),
    private readonly chatbotRepository = new ChatbotRepository(),
    private readonly zapiService = new ZapiService(),
    private readonly openAiService = new OpenAiService(),
  ) {}

  async validateCoverage(cep: string) {
    return this.cepRepository.findByCep(cep);
  }

  async handleIncomingCall(input: {
    phone: string;
    providerId?: string;
    rawPayload?: Prisma.InputJsonValue;
    instanceId?: string;
  }) {
    const phone = normalizeWhatsappPhone(input.phone);
    const agent = await this.chatbotRepository.getAgentByInstance(input.instanceId);
    const conversation = await this.chatbotRepository.findOrCreateConversation(phone, agent?.id);
    const eventId = input.providerId ? `call:${input.providerId}` : undefined;

    if (eventId) {
      const existing = await this.chatbotRepository.findMessageByProviderId(eventId);
      if (existing) return { state: conversation.state, replied: false, duplicated: true };
      const claimed = await this.chatbotRepository.claimInboundMessage({
        conversationId: conversation.id,
        body: "[Ligação recebida]",
        providerId: eventId,
        rawPayload: input.rawPayload ?? {},
      });
      if (!claimed) return { state: conversation.state, replied: false, duplicated: true };
    } else {
      await this.chatbotRepository.saveMessage({
        conversationId: conversation.id,
        direction: "inbound",
        body: "[Ligação recebida]",
        rawPayload: input.rawPayload ?? {},
      });
    }

    const memory = normalizeMemory(conversation.memory);
    const resumePrompt = callResumePrompt(conversation.state, memory, agent);
    const reply = `Não consigo atender ligações por aqui, mas continuo com você pelo WhatsApp. 😊\n\n${resumePrompt}`;
    await this.zapiService.sendText({ phone, message: reply, config: agentConfig(agent) });
    await this.chatbotRepository.saveMessage({
      conversationId: conversation.id,
      direction: "outbound",
      body: reply,
    });

    return { state: conversation.state, replied: true, duplicated: false };
  }

  async processIncomingMessage(input: {
    phone: string;
    message: string;
    providerId?: string;
    rawPayload?: Prisma.InputJsonValue;
    instanceId?: string;
    extractedData?: ExtractedCustomerData;
  }) {
    const phone = normalizeWhatsappPhone(input.phone);
    let alreadyReceived = false;

    if (input.providerId) {
      const existingMessage = await this.chatbotRepository.findMessageByProviderId(input.providerId);
      if (existingMessage) {
        const alreadyReplied = await this.chatbotRepository.hasOutboundResponseAfter(
          existingMessage.conversationId,
          existingMessage.createdAt,
        );
        if (alreadyReplied) {
          return { state: "DUPLICATED", replied: false, delayMs: 0 };
        }
        alreadyReceived = true;
      }
    }

    const agent = await this.chatbotRepository.getAgentByInstance(input.instanceId);
    const conversation = await this.chatbotRepository.findOrCreateConversation(phone, agent?.id);

    if (!alreadyReceived && input.providerId) {
      const claimed = await this.chatbotRepository.claimInboundMessage({
        conversationId: conversation.id,
        body: input.message,
        providerId: input.providerId,
        rawPayload: input.rawPayload ?? {},
      });
      if (!claimed) {
        return { state: "DUPLICATED", replied: false, delayMs: 0 };
      }
    } else if (!alreadyReceived) {
      await this.chatbotRepository.saveMessage({
        conversationId: conversation.id,
        direction: "inbound",
        body: input.message,
        rawPayload: input.rawPayload ?? {},
      });
    }

    if (input.providerId) {
      await this.zapiService.markAsRead(input.providerId, phone, agentConfig(agent));
    }

    const next = await this.nextResponse({
      phone,
      message: input.message,
      state: conversation.state,
      memory: normalizeMemory(conversation.memory),
      agent,
      extractedData: input.extractedData,
    });

    const minTyping = agent?.minTypingSeconds ?? 2;
    const maxTyping = agent?.maxTypingSeconds ?? 4;
    const delaySeconds = randomDelaySeconds(minTyping, maxTyping);
    const typingEnabled =
      (agent?.enableReplyDelay ?? true) && (agent?.enableTyping ?? true);

    await this.chatbotRepository.updateConversation({
      id: conversation.id,
      state: next.state,
      memory: next.memory as Prisma.InputJsonValue,
      leadId: next.leadId,
    });
    await this.zapiService.sendText({
      phone,
      message: next.reply,
      delayTypingSeconds: typingEnabled ? delaySeconds : undefined,
      config: agentConfig(agent),
    });
    if (next.interactive?.type === "button-list") {
      try {
        await this.zapiService.sendButtonList({
          phone,
          message: next.interactive.message,
          buttons: next.interactive.buttons,
          config: agentConfig(agent),
        });
      } catch {
        // Fallback keeps the conversational text already sent.
      }
    }
    if (next.interactive?.type === "option-list") {
      try {
        await this.zapiService.sendOptionList({
          phone,
          title: next.interactive.title,
          message: next.interactive.message,
          buttonLabel: next.interactive.buttonLabel,
          options: next.interactive.options,
          config: agentConfig(agent),
        });
      } catch {
        // Fallback keeps the conversational text already sent.
      }
    }
    await this.chatbotRepository.saveMessage({
      conversationId: conversation.id,
      direction: "outbound",
      body: next.reply,
    });

    return { state: next.state, replied: true, delayMs: typingEnabled ? delaySeconds * 1000 : 0 };
  }

  private async nextResponse(input: {
    phone: string;
    message: string;
    state: string;
    memory: ChatMemory;
    agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>;
    extractedData?: ExtractedCustomerData;
  }): Promise<NextBotResponse> {
    const originalText = input.message.trim();
    const text = extractedValueForState(input.state, input.extractedData) ?? originalText;
    const memory = { ...input.memory };
    const firstName = getFirstName(memory.name);
    const messageFor = (state: string, fallback: string) => interpolate(
      flowMessage(input.agent?.flow, state, fallback),
      memory,
      input.agent?.name,
    );

    if (isRestartRequest(text)) {
      return {
        state: "ASK_CEP",
        memory: {},
        reply: greetingMessage(input.agent?.name),
      };
    }

    if (isHandoffRequest(text)) {
      memory.handoff = true;
      return {
        state: "HUMAN_HANDOFF",
        memory,
        reply: "Combinado, vou sinalizar para uma consultora humana continuar seu atendimento por aqui. 😊",
      };
    }

    if (input.extractedData && text === originalText) {
      return {
        state: input.state,
        memory,
        reply: `Recebi o arquivo ou áudio, mas não consegui identificar com segurança o dado necessário. Envie novamente com boa qualidade ou escreva a informação, por favor. 😊\n\n${promptForState(input.state, firstName)}`,
      };
    }

    if (asksForPlanRecommendation(text)) {
      const plans = await this.getPlans(input.agent);
      const recommended = findRecommendedPlan(plans);
      const recommendation = recommended
        ? `Para essa necessidade, recomendo o ${recommended.name} por ${formatMoney(Number(recommended.price))} + Globoplay (GRÁTIS). É a opção mais completa entre os planos disponíveis. 😊`
        : "No momento não há planos ativos vinculados a este atendimento.";
      return {
        state: input.state,
        memory,
        reply: `${recommendation}\n\n${promptForState(input.state, firstName)}`,
      };
    }

    if (asksForPlanList(text) || isPlanQuestion(text)) {
      const plans = await this.getPlans(input.agent);
      return {
        state: input.state,
        memory,
        reply: `Claro! 😊 Estes são os planos disponíveis:\n\n${formatPlanList(plans)}\n\n${promptForState(input.state, firstName)}`,
      };
    }

    if (shouldAnswerOutsideFlow(text, input.state)) {
      const answer = await this.answerOutsideFlow({
        message: text,
        state: input.state,
        agent: input.agent,
        customerName: memory.name,
      });
      return {
        state: input.state,
        memory,
        reply: `${answer}\n\n${promptForState(input.state, firstName)}`,
      };
    }

    if (input.state === "START") {
      return {
        state: "ASK_CEP",
        memory,
        reply: greetingMessage(input.agent?.name),
      };
    }

    if (input.state === "ASK_CEP") {
      const cep = parseCep(text);
      if (!cep) {
        return {
          state: "ASK_CEP",
          memory,
          reply: "Esse CEP parece incompleto. Pode me enviar os 8 números do CEP da instalação, por favor? 😊",
        };
      }

      const [coverage, viaCep] = await Promise.all([this.validateCoverage(cep), fetchViaCep(cep)]);
      memory.cep = cep;
      applyAddress(memory, {
        street: coverage?.street ?? viaCep?.street,
        neighborhood: coverage?.neighborhood ?? viaCep?.neighborhood,
        city: coverage?.city ?? viaCep?.city,
        state: coverage?.state ?? viaCep?.state,
      });

      if (!coverage) {
        return {
          state: "FINISHED_UNAVAILABLE",
          memory,
          reply: `Encontrei seu endereço 😊,📍 CEP ${formatCep(cep)}, localizado ${formatAddressShort(memory)}. No momento a Claro ainda não possui disponibilidade para instalação nessa região. Assim que houver expansão de cobertura, teremos prazer em atendê-lo. Obrigado pelo seu interesse! 💙`,
        };
      }

      return {
        state: "ASK_STREET_NUMBER",
        memory,
        reply: `Boa notícia 🎉! Temos viabilidade no CEP ${formatCep(cep)}, localizado ${formatAddressShort(memory)}. Consigo te atender com a Claro 🚀. Para seguir com a contratação, preciso coletar alguns dados seus.\n\nMe informe o número da residência:`,
      };
    }

    if (input.state === "ASK_STREET_NUMBER") {
      const streetNumber = parseSimpleNumber(text);
      if (!streetNumber) {
        return {
          state: "ASK_STREET_NUMBER",
          memory,
          reply: "Pode me informar somente o número da residência, por favor? 😊",
        };
      }
      memory.streetNumber = streetNumber;
      return {
        state: "ASK_COMPLEMENT",
        memory,
        reply: "Anotado 😊! Possui algum complemento?",
      };
    }

    if (input.state === "ASK_COMPLEMENT") {
      memory.complement = normalizeComplement(text);
      return {
        state: "ASK_ADDRESS_CONFIRM",
        memory,
        reply: `O endereço que cadastrei no sistema é: ${formatFullAddress(memory)}. Está correto?`,
        interactive: {
          type: "button-list",
          message: "Confirme se o endereço está correto.",
          buttons: [
            { id: "address_yes", label: "Sim" },
            { id: "address_no", label: "Não" },
          ],
        },
      };
    }

    if (input.state === "ASK_ADDRESS_CONFIRM") {
      if (isPositive(text)) {
        return {
          state: "ASK_NAME",
          memory,
          reply: "Perfeito 🎉! Agora me informe seu *nome completo* por gentileza.",
        };
      }

      if (isNegative(text)) {
        memory.streetNumber = undefined;
        memory.complement = undefined;
        return {
          state: "ASK_STREET_NUMBER",
          memory,
          reply: "Sem problema 😊 Vamos corrigir o endereço. Me informe novamente o número da residência.",
        };
      }

      return {
        state: "ASK_ADDRESS_CONFIRM",
        memory,
        reply: `O endereço que cadastrei no sistema é: ${formatFullAddress(memory)}. Está correto?`,
        interactive: {
          type: "button-list",
          message: "Confirme se o endereço está correto.",
          buttons: [
            { id: "address_yes", label: "Sim" },
            { id: "address_no", label: "Não" },
          ],
        },
      };
    }

    if (input.state === "ASK_NAME") {
      if (text.length < 3 || onlyDigits(text).length > 2) {
        return { state: "ASK_NAME", memory, reply: "Pode me informar seu nome completo, por favor? 😊" };
      }
      memory.name = toTitleCase(text);
      const plans = await this.getPlans(input.agent);
      return {
        state: "CHOOSE_PLAN",
        memory,
        reply: `Muito prazer, ${getFirstName(memory.name)} 😊! Agora chegou a hora de conhecer os melhores planos que têm cobertura na sua residência. Lembrando que todos possuem *Globoplay grátis*.\n\nToque no botão *Ver planos* para abrir a lista de opções.`,
        interactive: buildPlanOptionList(plans),
      };
    }

    if (input.state === "CHOOSE_PLAN") {
      const plans = await this.getPlans(input.agent);
      const selectedPlan = selectPlan(text, plans);

      if (!selectedPlan) {
        if (isPlanRefusal(text)) {
          return this.handlePlanObjection({ text, state: "CHOOSE_PLAN", memory, plans, agent: input.agent });
        }
        return {
          state: "CHOOSE_PLAN",
          memory,
          reply: `Claro! 😊 Toque no botão *Ver planos* para abrir a lista e escolher a opção desejada. Se preferir, você também pode escrever o nome do plano.`,
          interactive: buildPlanOptionList(plans),
        };
      }

      return {
        ...this.selectPlanAndConfirm({ memory, plan: selectedPlan }),
      };
    }

    if (input.state === "ASK_DOCUMENT") {
      const document = parseDocument(text);
      if (!document.valid) {
        return {
          state: "ASK_DOCUMENT",
          memory,
          reply: "Esse CPF ou CNPJ não parece válido. Pode conferir e me enviar novamente, por favor? 😊",
        };
      }
      memory.cpfCnpj = document.formatted;
      memory.documentType = document.type;
      return {
        state: "ASK_BIRTH_DATE",
        memory,
        reply: `${document.type} válido! ✅ Agora, por favor, me informe a sua data de nascimento.`,
      };
    }

    if (input.state === "ASK_BIRTH_DATE") {
      const birthDate = parseBirthDate(text);
      if (!birthDate) {
        return {
          state: "ASK_BIRTH_DATE",
          memory,
          reply: "Não consegui identificar a data. Pode enviar no formato 26/01/1998, por favor? 😊",
        };
      }
      memory.birthDate = birthDate.toISOString();
      return {
        state: "ASK_BILLING_DUE_DAY",
        memory,
        reply: `Data de nascimento aceita! 🎉 Para confirmar, você nasceu no dia ${formatDate(birthDate)}. Agora, por favor, me informe o melhor dia para vencimento da sua fatura: 5, 8, 10, 15, 20 ou 25.`,
      };
    }

    if (input.state === "ASK_BILLING_DUE_DAY") {
      const billingDay = parseBillingDay(text);
      if (!billingDay) {
        return {
          state: "ASK_BILLING_DUE_DAY",
          memory,
          reply: "A data de vencimento pode ser 5, 8, 10, 15, 20 ou 25. Qual você prefere? 📅",
        };
      }
      memory.billingDueDay = billingDay;
      return {
        state: "ASK_EMAIL",
        memory,
        reply: `Já anexei no sistema: a sua fatura vence todo dia ${billingDay} do mês. Para finalizar, agora eu só preciso que me informe seu *e-mail*.`,
      };
    }

    if (input.state === "ASK_EMAIL") {
      const email = parseEmail(text);
      if (!email) {
        return { state: "ASK_EMAIL", memory, reply: "Esse e-mail não parece válido. Pode me enviar novamente, por favor? 😊" };
      }
      memory.email = email;
      return {
        state: "CONFIRM_DATA",
        memory,
        reply: `Perfeito, ${getFirstName(memory.name)}! O e-mail registrado é: ${email}.\n\n${buildSummary(memory)}\n\nEstá tudo correto? ✅\n\nDigite *SIM* ou *NÃO*.`,
      };
    }

    if (input.state === "CONFIRM_DATA") {
      if (isPositive(text)) {
        const lead = await this.chatbotRepository.createLeadFromChat({
          name: memory.name ?? "Lead WhatsApp",
          phone: input.phone,
          email: memory.email,
          cpfCnpj: memory.cpfCnpj,
          birthDate: memory.birthDate ? new Date(memory.birthDate) : undefined,
          cep: memory.cep,
          address: memory.address,
          streetNumber: memory.streetNumber,
          complement: memory.complement,
          city: memory.city,
          state: memory.state,
          neighborhood: memory.neighborhood,
          billingDueDay: memory.billingDueDay,
          planId: memory.planId,
          planName: memory.planName,
          expectedValue: memory.planValue,
          notes: "Lead finalizado pelo fluxo do chatbot Joana.",
        });

        return {
          state: "FINISHED",
          memory,
          leadId: lead.id,
          reply: "Perfeito! 🎉 Seus dados foram confirmados.\n\nVou cadastrar aqui, deixa o celular ligado 📱, porque aprovando você receberá uma ligação da nossa central. Você precisa confirmar as informações do seu plano contratado, tudo bem?\n\nObrigado por escolher a Claro! 🚀 Se precisar de qualquer coisa, é só me chamar!",
        };
      }

      if (isNegative(text)) {
        return {
          state: "CORRECTION",
          memory,
          reply: "Entendi 😊, tudo bem! O que você gostaria de corrigir?",
        };
      }

      return {
        state: "CONFIRM_DATA",
        memory,
        reply: `${buildSummary(memory)}\n\nEstá tudo correto? ✅\n\nDigite *SIM* ou *NÃO*.`,
      };
    }

    if (input.state === "CORRECTION") {
      const corrected = await this.applyCorrection(text, memory, input.agent);
      return {
        state: "CONFIRM_DATA",
        memory: corrected,
        reply: `${buildSummary(corrected)}\n\nEstá tudo correto? ✅`,
      };
    }

    if (input.state === "FINISHED_UNAVAILABLE") {
      return {
        state: "FINISHED_UNAVAILABLE",
        memory,
        reply: "Esse atendimento foi finalizado porque ainda não temos cobertura nesse CEP. Se quiser consultar outro endereço, envie reiniciar. 😊",
      };
    }

    if (input.state === "FINISHED") {
      return {
        state: "FINISHED",
        memory,
        reply: "Seu atendimento já está registrado. Se precisar falar com uma consultora, envie atendente. Para começar novamente, envie reiniciar. 😊",
      };
    }

    if (input.state === "HUMAN_HANDOFF") {
      return {
        state: "HUMAN_HANDOFF",
        memory,
        reply: "Seu atendimento está sinalizado para uma consultora. Assim que possível, nossa equipe continua por aqui. 😊",
      };
    }

    return {
      state: "ASK_CEP",
      memory: {},
      reply: greetingMessage(input.agent?.name),
    };
  }

  private async getPlans(agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>) {
    if (!agent) return this.chatbotRepository.listActivePlans();
    return this.chatbotRepository.listActivePlans(agent.id);
  }

  private selectPlanAndConfirm(input: { memory: ChatMemory; plan: PlanCandidate }): NextBotResponse {
    const memory = {
      ...input.memory,
      planId: input.plan.id,
      planName: input.plan.name,
      planValue: Number(input.plan.price),
    };

    return {
      state: "ASK_DOCUMENT",
      memory,
      reply: `Tenho que confessar 😊! *${input.plan.name}* é um plano excelente. Parabéns pela escolha, ${getFirstName(memory.name)}.\n\nAgora, para continuar, me informe seu *CPF ou CNPJ*.`,
    };
  }

  private async handlePlanObjection(input: {
    text: string;
    state: string;
    memory: ChatMemory;
    plans: PlanCandidate[];
    agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>;
  }): Promise<NextBotResponse> {
    const memory = { ...input.memory, objectionCount: (input.memory.objectionCount ?? 0) + 1 };

    if (memory.objectionCount >= 3) {
      return {
        state: input.state,
        memory,
        reply: "Entendo! Se mudar de ideia ou precisar de alguma informação é só me avisar. 😁",
      };
    }

    const answer = await this.answerPlanQuestion({
      customerMessage: `O cliente apresentou objeção. Tentativa ${memory.objectionCount} de 3: ${input.text}`,
      customerName: memory.name,
      plans: input.plans.map((plan, index) => ({
        order: index + 1,
        name: plan.name,
        speed: plan.speed,
        price: Number(plan.price),
        description: plan.description,
      })),
      agent: input.agent,
    });

    return {
      state: input.state,
      memory,
      reply: answer || "Entendo você 😊 Pela estabilidade da Claro e pelo Globoplay incluso, vale muito a pena garantir agora. Qual plano faz mais sentido pra você?",
    };
  }

  private async applyCorrection(
    text: string,
    memory: ChatMemory,
    agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>,
  ) {
    const corrected = { ...memory };
    const normalized = normalizeText(text);
    const plans = await this.getPlans(agent);
    const selectedPlan = selectPlan(text, plans);
    const billingDay = parseBillingDay(text);
    const email = parseEmail(text);
    const birthDate = parseBirthDate(text);
    const document = parseDocument(text);
    const cep = parseCep(text);

    if (selectedPlan) {
      corrected.planId = selectedPlan.id;
      corrected.planName = selectedPlan.name;
      corrected.planValue = Number(selectedPlan.price);
    } else if (billingDay && /vencimento|dia|boleto|fatura/.test(normalized)) {
      corrected.billingDueDay = billingDay;
    } else if (email) {
      corrected.email = email;
    } else if (birthDate) {
      corrected.birthDate = birthDate.toISOString();
    } else if (document.valid) {
      corrected.cpfCnpj = document.formatted;
      corrected.documentType = document.type;
    } else if (cep) {
      corrected.cep = cep;
      const [coverage, viaCep] = await Promise.all([this.validateCoverage(cep), fetchViaCep(cep)]);
      applyAddress(corrected, {
        street: coverage?.street ?? viaCep?.street,
        neighborhood: coverage?.neighborhood ?? viaCep?.neighborhood,
        city: coverage?.city ?? viaCep?.city,
        state: coverage?.state ?? viaCep?.state,
      });
    } else if (/numero|n[uú]mero|casa|residencia|residência/.test(normalized)) {
      corrected.streetNumber = parseSimpleNumber(text) ?? corrected.streetNumber;
    } else if (/complemento|apto|apartamento|casa|bloco|fundos/.test(normalized)) {
      corrected.complement = normalizeComplement(text.replace(/complemento/gi, "").trim());
    } else if (/nome/.test(normalized) || text.split(/\s+/).length >= 2) {
      corrected.name = toTitleCase(text.replace(/nome/gi, "").trim());
    }

    return corrected;
  }

  private async answerPlanQuestion(input: {
    customerMessage: string;
    customerName?: string;
    plans: Array<{ order: number; name: string; speed: string; price: number; description: string | null }>;
    agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>;
  }) {
    try {
      const planLines = input.plans
        .map((plan) => `${plan.order}. ${plan.name} ${plan.speed} - ${formatMoney(plan.price)}${plan.description ? ` - ${plan.description}` : ""}`)
        .join("\n");

      return await this.openAiService.answerCommercialQuestion(
        [
          `Voce e ${input.agent?.name ?? "Joana"}, Consultora Comercial da Claro em um atendimento pelo WhatsApp.`,
          `Personalidade: ${input.agent?.personality ?? "Vendedora humana, simpatica, persuasiva e objetiva."}`,
          `Regras personalizadas:\n${formatAgentRules(input.agent?.rules)}`,
          "Responda em portugues do Brasil, de forma breve, vendedora e natural.",
          "Nunca invente preco, cobertura ou plano. Use somente os planos listados.",
          "Use no maximo um emoji.",
          "Depois de responder, conduza o cliente para escolher um plano.",
          `Cliente: ${input.customerName ?? "cliente"}`,
          `Planos disponiveis:\n${planLines || "Valores ainda nao cadastrados."}`,
          `Mensagem do cliente: ${input.customerMessage}`,
        ].join("\n\n"),
      );
    } catch {
      return "";
    }
  }

  private async answerOutsideFlow(input: {
    message: string;
    state: string;
    customerName?: string;
    agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>;
  }) {
    try {
      return await this.openAiService.answerCommercialQuestion(
        [
          `Voce e ${input.agent?.name ?? "Joana"}, Consultora Comercial da Claro.`,
          `Personalidade: ${input.agent?.personality ?? "Vendedora humana, cordial e objetiva."}`,
          `Regras:\n${formatAgentRules(input.agent?.rules)}`,
          `O funil esta na etapa ${input.state}. Responda a duvida sem pular etapa.`,
          "Nao responda temas politicos, religiosos ou fora do contexto comercial.",
          "Nunca diga que e IA, robo ou secretario eletronico.",
          "Use no maximo um emoji.",
          `Cliente: ${input.customerName ?? "cliente"}`,
          `Pergunta: ${input.message}`,
        ].join("\n\n"),
      );
    } catch {
      return "Posso te orientar sobre os planos e a contratação da Claro. 😊";
    }
  }
}

type NextBotResponse = {
  state: string;
  memory: ChatMemory;
  reply: string;
  leadId?: string;
  interactive?: InteractivePayload;
};

type InteractivePayload =
  | {
      type: "button-list";
      title?: string;
      message: string;
      footer?: string;
      buttons: Array<{ id: string; label: string }>;
    }
  | {
      type: "option-list";
      title: string;
      message: string;
      buttonLabel: string;
      footer?: string;
      options: Array<{ id: string; title: string; description?: string }>;
    };

type ChatMemory = {
  name?: string;
  cep?: string;
  address?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  streetNumber?: string;
  complement?: string;
  cpfCnpj?: string;
  documentType?: "CPF" | "CNPJ";
  birthDate?: string;
  email?: string;
  billingDueDay?: number;
  planId?: string;
  planName?: string;
  planValue?: number;
  recommendedPlanId?: string;
  handoff?: boolean;
  objectionCount?: number;
};

type PlanCandidate = {
  id: string;
  name: string;
  speed: string;
  price: unknown;
  description: string | null;
};

type ViaCepAddress = {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};

function normalizeMemory(memory: unknown): ChatMemory {
  if (memory && typeof memory === "object" && !Array.isArray(memory)) {
    return memory as ChatMemory;
  }
  return {};
}

function randomDelaySeconds(minSeconds: number, maxSeconds: number) {
  const min = Math.max(0, minSeconds);
  const max = Math.max(min + 1, maxSeconds);
  return Math.max(1, Math.floor(Math.random() * (max - min) + min));
}

function normalizeWhatsappPhone(phone: string) {
  const normalized = phone.trim().toLowerCase();
  const digits = onlyDigits(phone).replace(/^00/, "");
  if (normalized.endsWith("@lid")) return `${digits}@lid`;
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function parseCep(text: string) {
  const digits = onlyDigits(text);
  if (digits.length >= 8) return digits.slice(0, 8);

  const byWords = wordsToDigits(text);
  return byWords.length >= 8 ? byWords.slice(0, 8) : "";
}

function parseDocument(text: string): { valid: false; type?: never; formatted?: never } | { valid: true; type: "CPF" | "CNPJ"; formatted: string } {
  const digits = onlyDigits(text);
  if (digits.length === 11 && isValidCpf(digits)) {
    return { valid: true, type: "CPF", formatted: digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") };
  }
  if (digits.length === 14 && isValidCnpj(digits)) {
    return { valid: true, type: "CNPJ", formatted: digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") };
  }
  return { valid: false };
}

function isValidCpf(cpf: string) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

function isValidCnpj(cnpj: string) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: string, factors: number[]) => {
    const sum = factors.reduce((total, factor, index) => total + Number(base[index]) * factor, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

function parseBirthDate(text: string) {
  const normalized = normalizeText(text);
  const monthByName: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  let day = 0;
  let month = 0;
  let year = 0;
  const numbers = onlyDigits(text);
  const separated = text.match(/(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2,4})/);

  if (separated) {
    day = Number(separated[1]);
    month = Number(separated[2]);
    year = normalizeYear(Number(separated[3]));
  } else if (numbers.length === 8) {
    day = Number(numbers.slice(0, 2));
    month = Number(numbers.slice(2, 4));
    year = Number(numbers.slice(4, 8));
  } else {
    const monthName = Object.keys(monthByName).find((name) => normalized.includes(name));
    const parts = normalized.match(/\d+/g)?.map(Number) ?? [];
    if (monthName && parts.length >= 2) {
      day = parts[0];
      month = monthByName[monthName];
      year = normalizeYear(parts[1]);
    }
  }

  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return date;
}

function normalizeYear(year: number) {
  if (year < 100) return year > 30 ? 1900 + year : 2000 + year;
  return year;
}

function parseSimpleNumber(text: string) {
  const digits = onlyDigits(text);
  return digits || wordsToDigits(text) || "";
}

function parseBillingDay(text: string) {
  const digits = onlyDigits(text);
  const candidates = [Number(digits), Number(wordsToDigits(text))].filter(Boolean);
  return candidates.find((day) => VALID_BILLING_DAYS.includes(day)) ?? null;
}

function parseEmail(text: string) {
  const match = text.trim().match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0].toLowerCase() ?? "";
}

function normalizeComplement(text: string) {
  const normalized = text.trim();
  if (!normalized || /^(nao|não|sem|nenhum|n tem|nao tem|não tem)$/i.test(normalized)) {
    return "Sem complemento";
  }
  return normalized;
}

function applyAddress(memory: ChatMemory, address: ViaCepAddress) {
  memory.address = address.street ?? memory.address;
  memory.neighborhood = address.neighborhood ?? memory.neighborhood;
  memory.city = address.city ?? memory.city;
  memory.state = address.state ?? memory.state;
}

async function fetchViaCep(cep: string): Promise<ViaCepAddress | null> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (data.erro) return null;
    return {
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
    };
  } catch {
    return null;
  }
}

function formatCep(cep?: string) {
  const digits = onlyDigits(cep ?? "");
  return digits.length === 8 ? digits.replace(/(\d{5})(\d{3})/, "$1-$2") : cep ?? "";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatAddressShort(memory: ChatMemory) {
  const street = memory.address ? `na ${memory.address}` : "no endereço informado";
  const neighborhood = memory.neighborhood ? `, ${memory.neighborhood}` : "";
  const cityState = memory.city || memory.state ? ` – ${[memory.city, memory.state].filter(Boolean).join("/")}` : "";
  return `${street}${neighborhood}${cityState}`;
}

function formatFullAddress(memory: ChatMemory) {
  const base = [
    memory.address ?? "Rua não informada",
    memory.streetNumber ? `nº ${memory.streetNumber}` : "sem número",
    memory.complement && memory.complement !== "Sem complemento" ? memory.complement : "",
    memory.neighborhood,
  ].filter(Boolean).join(", ");
  const cityState = [memory.city, memory.state].filter(Boolean).join("/");
  return cityState ? `${base} – ${cityState}` : base;
}

function buildSummary(memory: ChatMemory) {
  const birthDate = memory.birthDate ? formatDate(new Date(memory.birthDate)) : "Não informado";
  return [
    "Aqui estão os dados que você me passou até agora:",
    `📍 CEP: ${formatCep(memory.cep)}`,
    `👤 Nome: ${memory.name ?? "Não informado"}`,
    `🆔 Documento: ${memory.cpfCnpj ?? "Não informado"}`,
    `🎂 Data de nascimento: ${birthDate}`,
    `🏠 Endereço: ${formatFullAddress(memory)}`,
    `📧 E-mail: ${memory.email ?? "Não informado"}`,
    `📅 Data de vencimento: ${memory.billingDueDay ?? "Não informado"}`,
    `📶 Plano: ${memory.planName ?? "Não informado"}`,
  ].join("\n");
}

function formatPlanList(plans: PlanCandidate[]) {
  if (!plans.length) return "No momento não há planos ativos cadastrados.";
  return plans
    .map((plan, index) => `${index + 1}. ${plan.name} - ${formatMoney(Number(plan.price))}/mês`)
    .join("\n");
}

function buildPlanOptionList(plans: PlanCandidate[]): Extract<InteractivePayload, { type: "option-list" }> {
  return {
    type: "option-list",
    title: "Planos disponíveis",
    message: "Escolha um plano na lista abaixo.",
    buttonLabel: "Ver planos",
    options: plans.map((plan) => ({
      id: plan.id,
      title: limitText(plan.name, 24),
      description: limitText(`${formatMoney(Number(plan.price))}/mês`, 72),
    })),
  };
}

function findRecommendedPlan(plans: PlanCandidate[]) {
  const preferred =
    plans.find((plan) => normalizeText(plan.name).includes("1 giga") && normalizeText(plan.name).includes("chip")) ??
    plans.find((plan) => normalizeText(plan.name).includes("500 mega") && normalizeText(plan.name).includes("chip"));
  if (preferred) return preferred;

  return plans.reduce<PlanCandidate | undefined>(
    (mostExpensive, plan) =>
      !mostExpensive || Number(plan.price) > Number(mostExpensive.price) ? plan : mostExpensive,
    undefined,
  );
}

function selectPlan(text: string, plans: PlanCandidate[]) {
  const normalized = normalizeText(text);

  const byName = plans.find((plan) => {
    const name = normalizeText(plan.name);
    const speed = normalizeText(plan.speed);
    return normalized.includes(name) || normalized.includes(speed);
  });
  if (byName) return byName;

  const aliases = [
    { terms: ["250", "duzentos e cinquenta"], chip: true },
    { terms: ["350", "trezentos e cinquenta"], chip: false },
    { terms: ["500", "quinhentos"], chip: true },
    { terms: ["500", "quinhentos"], chip: false },
    { terms: ["1gb", "1 giga", "um giga", "1000"], chip: true },
    { terms: ["1gb", "1 giga", "um giga", "1000"], chip: false },
  ];
  const wantsChip = normalized.includes("chip") || normalized.includes("celular") || normalized.includes("35gb");
  const alias = aliases.find((item) => item.chip === wantsChip && item.terms.some((term) => normalized.includes(term)));
  if (alias) {
    return plans.find((plan) => {
      const planName = normalizeText(`${plan.name} ${plan.speed}`);
      const hasSpeed = alias.terms.some((term) => planName.includes(normalizeText(term)));
      const hasChip = planName.includes("chip") || planName.includes("35gb");
      return hasSpeed && hasChip === alias.chip;
    });
  }

  const numericChoice = Number(normalized.match(/\b\d+\b/)?.[0]);
  if (numericChoice >= 1 && numericChoice <= plans.length && !normalized.includes("gb")) {
    return plans[numericChoice - 1];
  }

  return null;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsToDigits(value: string) {
  const digitWords: Record<string, string> = {
    zero: "0",
    um: "1",
    uma: "1",
    dois: "2",
    duas: "2",
    tres: "3",
    quatro: "4",
    cinco: "5",
    seis: "6",
    sete: "7",
    oito: "8",
    nove: "9",
  };
  return normalizeText(value)
    .split(" ")
    .map((word) => digitWords[word] ?? "")
    .join("");
}

function isHandoffRequest(text: string) {
  const normalized = normalizeText(text);
  return ["atendente", "humano", "consultor", "vendedor", "falar com alguem", "falar com uma pessoa"].some((term) => normalized.includes(term));
}

function isRestartRequest(text: string) {
  const normalized = normalizeText(text);
  return ["reiniciar", "recomecar", "comecar de novo", "novo atendimento", "outra consulta"].some((term) => normalized.includes(term));
}

function shouldAnswerOutsideFlow(text: string, state: string) {
  if (["START", "CONFIRM_DATA", "CORRECTION", "FINISHED", "FINISHED_UNAVAILABLE", "HUMAN_HANDOFF"].includes(state)) return false;
  return looksLikeQuestion(text) && !parseEmail(text) && !parseCep(text) && !parseBillingDay(text);
}

function looksLikeQuestion(text: string) {
  const normalized = normalizeText(text);
  return text.includes("?") || /^(como|qual|quais|quanto|quando|onde|por que|porque|tem|voce|voces|pode|posso)\b/.test(normalized);
}

function promptForState(state: string, firstName?: string) {
  const name = firstName ? `${firstName}, ` : "";
  const prompts: Record<string, string> = {
    ASK_CEP: "Para eu consultar a cobertura, me envie o CEP da instalação.",
    ASK_STREET_NUMBER: "Me informe o número da residência.",
    ASK_COMPLEMENT: "Agora me informe se há complemento para o endereço.",
    ASK_ADDRESS_CONFIRM: "Confira o endereço e responda SIM ou NÃO.",
    ASK_NAME: "Agora me informe seu nome completo, por gentileza.",
    ASK_DOCUMENT: `${name}agora me informe seu CPF ou CNPJ, por favor.`,
    ASK_BIRTH_DATE: "Agora me informe sua data de nascimento, por favor.",
    ASK_BILLING_DUE_DAY: "Qual vencimento você prefere: 5, 8, 10, 15, 20 ou 25?",
    ASK_EMAIL: "Agora preciso do seu e-mail, por favor.",
    CHOOSE_PLAN: "Qual plano você gostaria de escolher?",
  };
  return prompts[state] ?? "Me envie a próxima informação para continuarmos.";
}

function callResumePrompt(
  state: string,
  memory: ChatMemory,
  agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>,
) {
  if (state === "START") {
    return greetingMessage(agent?.name);
  }
  if (state === "FINISHED") return "Seu atendimento já está registrado. Se precisar, envie reiniciar para começar novamente.";
  if (state === "HUMAN_HANDOFF") return "Seu atendimento está sinalizado para uma consultora humana continuar por aqui.";
  return promptForState(state, getFirstName(memory.name));
}

function extractedValueForState(state: string, data?: ExtractedCustomerData) {
  if (!data) return undefined;
  const values: Record<string, string | undefined> = {
    ASK_CEP: data.cep,
    ASK_STREET_NUMBER: data.streetNumber,
    ASK_NAME: data.fullName,
    ASK_DOCUMENT: data.cpf,
    ASK_BIRTH_DATE: data.birthDate,
    ASK_EMAIL: data.email,
  };
  return values[state];
}

function asksForPlanList(text: string) {
  const normalized = normalizeText(text);
  return ["ver os planos", "quero ver", "opcoes", "opcoes disponiveis", "quais planos", "outros planos"].some((term) => normalized.includes(term));
}

function asksForPlanRecommendation(text: string) {
  const normalized = normalizeText(text);
  const mentionsPlan = /\b(plano|internet|fibra|mega|giga|velocidade)\b/.test(normalized);
  const requestsRecommendation = [
    "melhor", "recomenda", "recomende", "recomendacao", "indica", "indique", "ideal",
    "para jogar", "para jogos", "para trabalhar", "para estudar", "mais rapido", "mais completa",
  ].some((term) => normalized.includes(term));
  return mentionsPlan && requestsRecommendation;
}

function isPlanQuestion(text: string) {
  const normalized = normalizeText(text);
  return /\b(plano|planos|internet|fibra|mega|megas|giga|chip)\b/.test(normalized) && looksLikeQuestion(text);
}

function isAlternativeRequest(text: string) {
  const normalized = normalizeText(text);
  return ["outro", "outra", "outra opcao", "outra opção", "prefiro outro"].some((term) => normalized.includes(normalizeText(term)));
}

function isPositive(text: string) {
  const normalized = normalizeText(text);
  return ["sim", "isso", "esse", "essa", "confirmo", "correto", "ta certo", "esta certo", "pode ser", "fechado", "quero"].some((term) => normalized === term || normalized.includes(term));
}

function isNegative(text: string) {
  const normalized = normalizeText(text);
  return ["nao", "não", "errado", "corrigir", "alterar", "mudar"].some((term) => normalized.includes(normalizeText(term)));
}

function isPlanRefusal(text: string) {
  const normalized = normalizeText(text);
  return ["nao quero", "nao gostei", "nao tenho interesse", "muito caro", "ta caro", "esta caro", "vou pensar", "deixa pra la", "nenhum plano", "nao vou contratar"].some((term) => normalized.includes(term));
}

function getFirstName(name?: string) {
  return name?.split(" ").filter(Boolean)[0] ?? "";
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function limitText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function interpolate(template: string, memory: ChatMemory, agentName?: string) {
  return template
    .replaceAll("{{agente}}", agentName || "Joana")
    .replaceAll("{{nome}}", getFirstName(memory.name) || "cliente")
    .replaceAll("{{cep}}", formatCep(memory.cep))
    .replaceAll("{{endereco}}", formatFullAddress(memory));
}

function greetingMessage(agentName?: string) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date()),
  );

  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return `Olá, ${greeting}! Eu sou a ${agentName ?? "Joana"}!\nConsultora da Claro, para verificar se na sua região tem cobertura, poderia me informar o *CEP da instalação?*`;
}

function agentConfig(agent: Awaited<ReturnType<ChatbotRepository["getAgentByInstance"]>>) {
  if (!agent) return undefined;
  return {
    baseUrl: agent.zapiBaseUrl ?? undefined,
    instanceId: agent.zapiInstanceId ?? undefined,
    token: agent.zapiToken ?? undefined,
    clientToken: agent.zapiClientToken ?? undefined,
    whatsappNumber: agent.zapiWhatsappNumber ?? undefined,
  };
}

function flowMessage(flow: unknown, state: string, fallback: string) {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return fallback;
  const steps = (flow as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return fallback;
  const step = steps.find((item) => item && typeof item === "object" && (item as { state?: string }).state === state);
  const message = step && typeof step === "object" ? (step as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function formatAgentRules(rules: unknown) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return "Nenhuma regra adicional configurada.";
  return Object.values(rules)
    .filter((value) => value !== false && value !== null && value !== undefined)
    .map((value) => `- ${String(value)}`)
    .join("\n") || "Nenhuma regra adicional configurada.";
}
