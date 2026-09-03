import type { Prisma } from "@prisma/client";
import { CepRepository } from "@/repositories/cep.repository";
import { ChatbotRepository } from "@/repositories/chatbot.repository";
import { OpenAiService } from "@/services/openai/openai.service";
import type { ExtractedCustomerData } from "@/services/openai/openai.service";
import { sendEvolutionTextMessage } from "@/services/evolution";
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
    const coverage = await this.cepRepository.findByCep(cep);
    if (coverage) return coverage;

    return {
      cep,
      available: true,
      street: null,
      neighborhood: null,
      city: null,
      state: null,
    };
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
    provider?: "zapi" | "evolution";
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

    const provider = input.provider ?? "zapi";

    if (input.providerId && provider === "zapi") {
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
    if (provider === "evolution") {
      await sendEvolutionTextMessage({ to: phone, message: next.reply });
    } else {
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
    const memory = { ...input.memory };
    applyExtractedAddress(memory, input.extractedData);
    const text = extractedValueForState(input.state, input.extractedData) ?? originalText;
    const firstName = getFirstName(memory.name);
    applyParsedCustomerData(memory, text, input.state);

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

    if (input.extractedData && text === originalText && !hasUsefulExtractedDataForState(input.state, input.extractedData)) {
      return {
        state: input.state,
        memory,
        reply: mediaFallbackReply(input.state, firstName),
      };
    }

    if (asksForPlanRecommendation(text)) {
      const plans = await this.getPlans(input.agent);
      const recommended = findRecommendedPlan(plans);
      const recommendation = recommended
        ? `Para essa necessidade, recomendo o ${recommended.name} por ${formatMoney(Number(recommended.price))}/mês. É uma das opções mais completas entre os planos disponíveis. 😊`
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
      if (input.state === "ASK_DOCUMENT" && asksWhyCpf(text)) {
        return {
          state: input.state,
          memory,
          reply: "O CPF é necessário para realizar a análise e o cadastro da contratação. 🔐\nEle faz parte dos dados necessários para encaminharmos sua solicitação.\n\nDepois disso, continuamos normalmente de onde paramos. 😊\nPode me informar seu CPF?",
        };
      }
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
          state: "ASK_STREET_NUMBER",
          memory,
          reply: addressFoundMessage(memory),
        };
      }

      return {
        state: "ASK_STREET_NUMBER",
        memory,
        reply: addressFoundMessage(memory),
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
        reply: "Anotado! 😊\nO endereço possui algum complemento, como apartamento, bloco, condomínio ou casa dos fundos? 🏠\nSe não tiver, pode responder apenas “Não”.",
      };
    }

    if (input.state === "ASK_COMPLEMENT") {
      memory.complement = normalizeComplement(text);
      const plans = await this.getPlans(input.agent);
      return {
        state: "CHOOSE_PLAN",
        memory,
        reply: `Perfeito! 😊 Seu endereço ficou:\n📍 ${formatAddressForPlanIntro(memory)}\n\nAgora vou te apresentar os planos disponíveis para contratação. 🛜🚀\n\n${formatPlanList(plans)}\n${costBenefitHint(plans)}\nQual você prefere?\n👉 Pode me responder apenas com o número da opção.`,
        interactive: buildPlanOptionList(plans),
      };
    }

    if (input.state === "ASK_ADDRESS_CONFIRM") {
      const plans = await this.getPlans(input.agent);
      return {
        state: "CHOOSE_PLAN",
        memory,
        reply: `Perfeito 🎉!\n\n${formatPlanList(plans)}\n\nQual plano você prefere?`,
        interactive: buildPlanOptionList(plans),
      };
    }

    if (input.state === "ASK_NAME") {
      memory.name = extractNameFromText(text) || memory.name;
      if (!memory.name && (text.length < 3 || onlyDigits(text).length > 2)) {
        return { state: "ASK_NAME", memory, reply: "Pode me informar seu nome completo, por favor? 😊" };
      }
      if (!memory.name) memory.name = toTitleCase(text);
      return nextCustomerDataResponse(memory, `Muito prazer, ${getFirstName(memory.name)}! 😊\nSeu nome já está registrado. ✅\n\n`);
    }

    if (input.state === "CHOOSE_PLAN") {
      const plans = await this.getPlans(input.agent);
      const selectedPlan = selectPlan(text, plans);

      if (memory.pendingUpsellPlanId && memory.planId) {
        const pendingUpsell = plans.find((plan) => plan.id === memory.pendingUpsellPlanId);
        const originalPlan = plans.find((plan) => plan.id === memory.planId);
        const selectedPending = selectedPlan?.id === pendingUpsell?.id;
        const selectedOriginal = selectedPlan?.id === originalPlan?.id;

        if ((isPositive(text) || selectedPending) && pendingUpsell) {
          memory.pendingUpsellPlanId = undefined;
          return this.selectPlanAndConfirm({ memory, plan: pendingUpsell });
        }

        if ((isNegative(text) || selectedOriginal) && originalPlan && pendingUpsell) {
          memory.pendingUpsellPlanId = undefined;
          memory.declinedUpsellPlanIds = [...(memory.declinedUpsellPlanIds ?? []), pendingUpsell.id];
          return this.selectPlanAndConfirm({
            memory,
            plan: originalPlan,
            prefix: `Sem problemas! 😊\nEntão vamos continuar com:\n🛜 ${originalPlan.name}\n💰 ${formatMoney(Number(originalPlan.price))}/mês\n\n`,
          });
        }
      }

      if (!selectedPlan) {
        if (isPlanRefusal(text)) {
          return this.handlePlanObjection({ text, state: "CHOOSE_PLAN", memory, plans, agent: input.agent });
        }
        return {
          state: "CHOOSE_PLAN",
          memory,
          reply: `Claro! 😊 Estes são os planos disponíveis:\n\n${formatPlanList(plans)}\n\nQual você prefere? Pode responder com o número da opção ou com o nome do plano.`,
          interactive: buildPlanOptionList(plans),
        };
      }

      const upsell = findUpsellCandidate(selectedPlan, plans, memory);
      if (upsell) {
        memory.planId = selectedPlan.id;
        memory.planName = selectedPlan.name;
        memory.planValue = Number(selectedPlan.price);
        memory.pendingUpsellPlanId = upsell.id;
        memory.offeredUpsellPlanIds = [...(memory.offeredUpsellPlanIds ?? []), upsell.id];
        return {
          state: "CHOOSE_PLAN",
          memory,
          reply: upsellMessage(selectedPlan, upsell),
        };
      }

      return {
        ...this.selectPlanAndConfirm({ memory, plan: selectedPlan }),
      };
    }

    if (input.state === "ASK_DOCUMENT") {
      const document = parseDocument(text);
      if (!document.valid && !memory.cpfCnpj) {
        return {
          state: "ASK_DOCUMENT",
          memory,
          reply: "Esse CPF ou CNPJ não parece válido. Pode conferir e me enviar novamente, por favor? 😊",
        };
      }
      if (document.valid) {
        memory.cpfCnpj = document.formatted;
        memory.documentType = document.type;
      }
      return nextCustomerDataResponse(memory, `Perfeito! ✅ ${memory.documentType ?? "CPF"} registrado.\nEstamos avançando com seu cadastro. 😊\n\n`);
    }

    if (input.state === "ASK_BIRTH_DATE") {
      const birthDate = parseBirthDate(text);
      if (!birthDate && !memory.birthDate) {
        return {
          state: "ASK_BIRTH_DATE",
          memory,
          reply: "Não consegui identificar a data. Pode enviar no formato 26/01/1998, por favor? 😊",
        };
      }
      if (birthDate) memory.birthDate = birthDate.toISOString();
      return nextCustomerDataResponse(memory, `Perfeito! 🎉\n📅 Data de nascimento registrada: ${formatDate(new Date(memory.birthDate ?? ""))}\nEstamos quase terminando seus dados. 😊\n\n`);
    }

    if (input.state === "ASK_EMAIL") {
      const email = parseEmail(text);
      if (!email && !memory.email) {
        return { state: "ASK_EMAIL", memory, reply: "Esse e-mail não parece válido. Pode me enviar novamente, por favor? 😊" };
      }
      if (email) memory.email = email;
      return nextCustomerDataResponse(memory, `Perfeito! ✅\n📧 Registrei: ${memory.email}\n\n`);
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
        state: "CONFIRM_DATA",
        memory,
        reply: `Perfeito! 😊 Vencimento escolhido para o dia ${billingDay}.\nChegamos à última confirmação. 🎉\n\n${buildSummary(memory)}\n\nEstá tudo correto? 😊\n👉 Digite *SIM* para confirmar sua solicitação.\nCaso alguma informação esteja incorreta, responda *NÃO* que eu te ajudo a corrigir.`,
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
          notes: "Lead finalizado pelo fluxo do chatbot Lily.",
        });

        return {
          state: "FINISHED",
          memory,
          leadId: lead.id,
          reply: `Perfeito, ${getFirstName(memory.name) || "cliente"}! 🎉💙\nSua solicitação foi registrada com sucesso. ✅\n\nAgora seus dados seguirão para análise, validação das informações e verificação da disponibilidade para instalação no endereço. 🛜\n\n📱 Fique atento ao seu celular, pois nossa equipe poderá entrar em contato para concluir a validação.\n\nPara agilizar o atendimento, deixe separado:\n🪪 RG ou CNH\n🏠 Comprovante de residência\n\nApós a validação e aprovação, nossa equipe seguirá com você para verificar as opções disponíveis e, sendo possível a instalação, realizar o agendamento. 🚀\n\n⚠️ É importante atender ao contato da nossa equipe para evitar atrasos na sua solicitação.\nObrigado pela preferência! 💙`,
        };
      }

      if (isNegative(text)) {
        return {
          state: "CORRECTION",
          memory,
          reply: "Sem problemas! 😊 Vamos corrigir.\nMe informe qual dado precisa ser alterado:\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ Data de nascimento\n4️⃣ E-mail\n5️⃣ Endereço\n6️⃣ Vencimento\n7️⃣ Plano\n\n👉 Digite o número da opção que deseja corrigir.\nApós a correção, eu te mostro novamente o resumo completo antes de confirmar. ✅",
        };
      }

      return {
        state: "CONFIRM_DATA",
        memory,
        reply: `${buildSummary(memory)}\n\nEstá tudo correto? ✅\n\nDigite *SIM* ou *NÃO*.`,
      };
    }

    if (input.state === "CORRECTION") {
      const correctionField = memory.correctionField ?? parseCorrectionField(text);
      if (!correctionField) {
        return {
          state: "CORRECTION",
          memory,
          reply: "Me diga qual dado quer corrigir:\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ Data de nascimento\n4️⃣ E-mail\n5️⃣ Endereço\n6️⃣ Vencimento\n7️⃣ Plano",
        };
      }
      if (!memory.correctionField && isCorrectionChoiceOnly(text)) {
        memory.correctionField = correctionField;
        return {
          state: "CORRECTION",
          memory,
          reply: correctionPrompt(correctionField),
        };
      }
      const corrected = await this.applyCorrection(text, { ...memory, correctionField }, input.agent);
      corrected.correctionField = undefined;
      return {
        state: "CONFIRM_DATA",
        memory: corrected,
        reply: `${buildSummary(corrected)}\n\nEstá tudo correto? 😊\n👉 Digite *SIM* para confirmar sua solicitação.\nCaso ainda tenha algo incorreto, responda *NÃO*.`,
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

  private selectPlanAndConfirm(input: { memory: ChatMemory; plan: PlanCandidate; prefix?: string }): NextBotResponse {
    const memory = {
      ...input.memory,
      planId: input.plan.id,
      planName: input.plan.name,
      planValue: Number(input.plan.price),
      pendingUpsellPlanId: undefined,
    };

    return nextCustomerDataResponse(
      memory,
      input.prefix ?? selectedPlanMessage(input.plan),
    );
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
      reply: answer || "Entendo você 😊 Se quiser, posso te ajudar a comparar as opções disponíveis pelo custo-benefício. Qual plano faz mais sentido pra você?",
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

    if (corrected.correctionField === "plan" && selectedPlan) {
      corrected.planId = selectedPlan.id;
      corrected.planName = selectedPlan.name;
      corrected.planValue = Number(selectedPlan.price);
    } else if (corrected.correctionField === "billing" && billingDay) {
      corrected.billingDueDay = billingDay;
    } else if (corrected.correctionField === "email" && email) {
      corrected.email = email;
    } else if (corrected.correctionField === "birthDate" && birthDate) {
      corrected.birthDate = birthDate.toISOString();
    } else if (corrected.correctionField === "document" && document.valid) {
      corrected.cpfCnpj = document.formatted;
      corrected.documentType = document.type;
    } else if (corrected.correctionField === "address" && cep) {
      corrected.cep = cep;
      const [coverage, viaCep] = await Promise.all([this.validateCoverage(cep), fetchViaCep(cep)]);
      applyAddress(corrected, {
        street: coverage?.street ?? viaCep?.street,
        neighborhood: coverage?.neighborhood ?? viaCep?.neighborhood,
        city: coverage?.city ?? viaCep?.city,
        state: coverage?.state ?? viaCep?.state,
      });
    } else if (corrected.correctionField === "address" && /numero|n[uú]mero|casa|residencia|residência/.test(normalized)) {
      corrected.streetNumber = parseSimpleNumber(text) ?? corrected.streetNumber;
    } else if (corrected.correctionField === "address" && /complemento|apto|apartamento|casa|bloco|fundos/.test(normalized)) {
      corrected.complement = normalizeComplement(text.replace(/complemento/gi, "").trim());
    } else if (corrected.correctionField === "name" && (/nome/.test(normalized) || text.split(/\s+/).length >= 2)) {
      corrected.name = toTitleCase(text.replace(/nome/gi, "").trim());
    } else if (selectedPlan) {
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
          `Voce e ${input.agent?.name ?? "Lily"}, consultora comercial de planos de internet fibra em um atendimento pelo WhatsApp.`,
          `Personalidade: ${input.agent?.personality ?? "Vendedora humana, simpatica, persuasiva e objetiva."}`,
          `Regras personalizadas:\n${formatAgentRules(input.agent?.rules)}`,
          "Responda em portugues do Brasil, de forma breve, vendedora e natural.",
          "Nunca invente preco, cobertura, operadora disponivel, prazo, taxa, fidelidade, promocao ou plano. Use somente os dados listados.",
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
          `Voce e ${input.agent?.name ?? "Lily"}, consultora comercial de planos de internet fibra.`,
          `Personalidade: ${input.agent?.personality ?? "Vendedora humana, cordial e objetiva."}`,
          `Regras:\n${formatAgentRules(input.agent?.rules)}`,
          `O funil esta na etapa ${input.state}. Responda a duvida sem pular etapa.`,
          "Nao responda temas politicos, religiosos ou fora do contexto comercial.",
          "Nunca confirme cobertura, disponibilidade tecnica, prazo, taxa, fidelidade ou promocao se essa informacao nao estiver cadastrada.",
          "Nunca diga que e IA, robo ou secretario eletronico.",
          "Use no maximo um emoji.",
          `Cliente: ${input.customerName ?? "cliente"}`,
          `Pergunta: ${input.message}`,
        ].join("\n\n"),
      );
    } catch {
      return "Posso te orientar sobre os planos e a solicitação de contratação. 😊";
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
  pendingUpsellPlanId?: string;
  offeredUpsellPlanIds?: string[];
  declinedUpsellPlanIds?: string[];
  correctionField?: CorrectionField;
};

type CorrectionField = "name" | "document" | "birthDate" | "email" | "address" | "billing" | "plan";

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
  const explicitCep = text.match(/\b\d{5}-?\d{3}\b/);
  if (explicitCep) {
    return explicitCep[0].replace(/\D/g, "");
  }

  const spacedCep = text.match(/\b\d{5}\s+\d{3}\b/);
  if (spacedCep) {
    return spacedCep[0].replace(/\D/g, "");
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    const lineCep = line.match(/\b\d{5}-?\d{3}\b/);
    if (lineCep) return lineCep[0].replace(/\D/g, "");
  }

  const digits = onlyDigits(text);
  if (/^\d{8}$/.test(digits)) return digits;

  const byWords = wordsToDigits(text);
  return /^\d{8}$/.test(byWords) ? byWords : "";
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
  const street = memory.address ? memory.address : "Endereço informado";
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

function formatAddressForPlanIntro(memory: ChatMemory) {
  const firstLine = [
    memory.address ?? "Rua não informada",
    memory.streetNumber ? `nº ${memory.streetNumber}` : "sem número",
  ].filter(Boolean).join(", ");
  const secondLine = [
    memory.neighborhood,
    memory.city || memory.state ? `${memory.city ?? ""}${memory.city && memory.state ? "/" : ""}${memory.state ?? ""}` : "",
  ].filter(Boolean).join(" – ");
  return secondLine ? `${firstLine}\n ${secondLine}` : firstLine;
}

function buildSummary(memory: ChatMemory) {
  const birthDate = memory.birthDate ? formatDate(new Date(memory.birthDate)) : "Não informado";
  return [
    "Confira sua solicitação:",
    "━━━━━━━━━━━━━━━━━━",
    "🛜 PLANO",
    `${memory.planName ?? "Não informado"}`,
    `💰 ${memory.planValue ? `${formatMoney(memory.planValue)}/mês` : "Não informado"}`,
    "━━━━━━━━━━━━━━━━━━",
    `👤 Nome: ${memory.name ?? "Não informado"}`,
    `🆔 ${memory.documentType ?? "CPF"}: ${memory.cpfCnpj ?? "Não informado"}`,
    `🎂 Nascimento: ${birthDate}`,
    `📧 E-mail: ${memory.email ?? "Não informado"}`,
    `📍 CEP: ${formatCep(memory.cep)}`,
    `🏠 Endereço: ${formatFullAddress(memory)}`,
    `📅 Vencimento: ${memory.billingDueDay ? `Dia ${memory.billingDueDay}` : "Não informado"}`,
    "━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

function formatPlanList(plans: PlanCandidate[]) {
  if (!plans.length) return "No momento não há planos ativos cadastrados.";
  const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  return [
    "🛜 PLANOS DE INTERNET FIBRA",
    ...plans.map((plan, index) => `${numberEmojis[index] ?? `${index + 1}.`} ${plan.name} — ${formatMoney(Number(plan.price))}/mês${planListBadge(plan)}`),
  ].join("\n");
}

function planListBadge(plan: PlanCandidate) {
  const speed = planSpeedMbps(plan);
  if (speed === 500) return " ⭐";
  if (speed === 600) return " 🚀";
  if (speed >= 1000) return " ⚡";
  return "";
}

function buildPlanOptionList(plans: PlanCandidate[]): Extract<InteractivePayload, { type: "option-list" }> {
  return {
    type: "option-list",
    title: "Planos disponíveis",
    message: "Escolha um plano na lista abaixo.",
    buttonLabel: "Ver planos",
    options: plans.map((plan) => ({
      id: plan.id,
      title: limitText(planOptionTitle(plan), 24),
      description: limitText(planOptionDescription(plan), 72),
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

function findUpsellCandidate(selectedPlan: PlanCandidate, plans: PlanCandidate[], memory: ChatMemory) {
  const selectedSpeed = planSpeedMbps(selectedPlan);
  if (!selectedSpeed) return null;

  const declined = new Set(memory.declinedUpsellPlanIds ?? []);
  const offered = new Set(memory.offeredUpsellPlanIds ?? []);
  const targetSpeed = selectedSpeed === 200 ? 350 : selectedSpeed === 400 ? 500 : 0;
  if (!targetSpeed) return null;

  return plans.find((plan) => planSpeedMbps(plan) === targetSpeed && !declined.has(plan.id) && !offered.has(plan.id)) ?? null;
}

function upsellMessage(selectedPlan: PlanCandidate, upsellPlan: PlanCandidate) {
  const difference = Number(upsellPlan.price) - Number(selectedPlan.price);
  const selectedSpeed = planSpeedMbps(selectedPlan);
  const upsellSpeed = planSpeedMbps(upsellPlan);
  const selectedPrice = formatMoney(Number(selectedPlan.price));
  const upsellPrice = formatMoney(Number(upsellPlan.price));

  if (selectedSpeed === 200 && upsellSpeed === 350) {
    return [
      "Antes de continuarmos, tenho uma opção que vale a pena você conhecer. 😊",
      `Hoje o plano de ${upsellPlan.name} custa ${upsellPrice}/mês, enquanto o de ${selectedPlan.name} custa ${selectedPrice}.`,
      "Ou seja:",
      `1️⃣ ${selectedPlan.name} — ${selectedPrice}/mês`,
      `2️⃣ ${upsellPlan.name} — ${upsellPrice}/mês 🚀`,
      "Você leva mais velocidade e ainda paga alguns centavos a menos.",
      `Quer aproveitar os ${upsellPlan.name} por ${upsellPrice} ou prefere continuar com os ${selectedPlan.name}?`,
    ].join("\n");
  }

  return [
    "Boa escolha! 😊",
    "Antes de continuarmos, deixa eu te mostrar uma opção que pode compensar bastante:",
    "",
    `🔹 ${selectedPlan.name} — ${selectedPrice}/mês`,
    `⭐ ${upsellPlan.name} — ${upsellPrice}/mês`,
    "",
    `A diferença é de apenas ${formatMoney(difference)} por mês e você leva mais ${upsellSpeed - selectedSpeed} Mega de velocidade. 🚀`,
    `Quer manter os ${selectedPlan.name} ou prefere aproveitar os ${upsellPlan.name} por ${upsellPrice}?`,
  ].join("\n");
}

function planSpeedMbps(plan: PlanCandidate) {
  const normalized = normalizeText(`${plan.name} ${plan.speed}`);
  const gigaMatch = normalized.match(/(\d+(?:\s|)?)\s*giga/);
  if (gigaMatch) return Number(gigaMatch[1].trim() || 1) * 1000;
  const megaMatch = normalized.match(/(\d+)\s*mega/);
  if (megaMatch) return Number(megaMatch[1]);
  return 0;
}

function addressFoundMessage(memory: ChatMemory) {
  return [
    "Perfeito! 😊 Localizei o endereço:",
    `📍 ${formatAddressShort(memory)}`,
    "",
    "Agora só preciso completar o endereço.",
    "Qual é o número da residência? 🏠",
  ].join("\n");
}

function costBenefitHint(plans: PlanCandidate[]) {
  const has500 = plans.some((plan) => planSpeedMbps(plan) === 500);
  const has600 = plans.some((plan) => planSpeedMbps(plan) === 600);
  if (has500 && has600) {
    return "Se você estiver procurando custo-benefício, eu daria uma atenção especial aos planos de 500 e 600 Mega. 😉";
  }
  return "Se você estiver procurando custo-benefício, eu daria uma atenção especial aos planos com melhor velocidade pelo menor valor. 😉";
}

function nextCustomerDataResponse(memory: ChatMemory, prefix = ""): NextBotResponse {
  if (!memory.name) {
    return {
      state: "ASK_NAME",
      memory,
      reply: `${prefix}Qual é o seu nome completo, por favor? 👤`,
    };
  }

  if (!memory.cpfCnpj) {
    return {
      state: "ASK_DOCUMENT",
      memory,
      reply: `${prefix}Agora preciso de uma informação necessária para seguirmos com a solicitação e análise do cadastro.\n🔐 Me informe o seu CPF, por favor.`,
    };
  }

  if (!memory.birthDate) {
    return {
      state: "ASK_BIRTH_DATE",
      memory,
      reply: `${prefix}📅 Agora preciso da sua data de nascimento.\nPode me informar no formato DD/MM/AAAA?`,
    };
  }

  if (!memory.email) {
    return {
      state: "ASK_EMAIL",
      memory,
      reply: `${prefix}📧 Agora me informe o seu e-mail, por favor.`,
    };
  }

  if (!memory.billingDueDay) {
    return {
      state: "ASK_BILLING_DUE_DAY",
      memory,
      reply: `${prefix}Agora falta escolher o melhor dia para o vencimento da sua fatura. 💳\n📅 Você pode escolher:\n05 • 08 • 10 • 15 • 20 • 25\n\nQual dia fica melhor para você?`,
    };
  }

  return {
    state: "CONFIRM_DATA",
    memory,
    reply: `${prefix}${buildSummary(memory)}\n\nEstá tudo correto? 😊\n👉 Digite *SIM* para confirmar sua solicitação.\nCaso alguma informação esteja incorreta, responda *NÃO* que eu te ajudo a corrigir.`,
  };
}

function selectedPlanMessage(plan: PlanCandidate) {
  const speed = planSpeedMbps(plan);
  const price = formatMoney(Number(plan.price));

  if (speed === 350) {
    return `Ótima escolha! 😊🛜\nEntão ficou:\n🚀 ${plan.name}\n💰 ${price}/mês\n\nÉ uma ótima opção para quem busca uma boa velocidade sem aumentar o valor mensal.\nAgora vou iniciar seus dados para seguirmos com a solicitação. ✅\n`;
  }

  if (speed === 500) {
    return `Ótima escolha! ⭐😊\nVocê escolheu:\n🛜 ${plan.name}\n💰 ${price}/mês\n\nÉ uma das opções com melhor custo-benefício para quem utiliza vários aparelhos conectados no dia a dia. 📱📺💻\nAgora vou iniciar seus dados para seguirmos com a solicitação. ✅\n`;
  }

  if (speed === 600) {
    return `Excelente escolha! 🚀\nVocê escolheu:\n🛜 ${plan.name}\n💰 ${price}/mês\n\nUma ótima opção para quem busca bastante velocidade e utiliza vários dispositivos conectados. ⚡\nAgora vou iniciar seus dados para seguirmos com a solicitação. ✅\n`;
  }

  if (speed >= 1000) {
    return `Excelente escolha! ⚡🔥\nVocê escolheu:\n🛜 ${plan.name}\n💰 ${price}/mês\n\nÉ a opção para quem procura bastante velocidade e desempenho para vários dispositivos conectados. 🚀\nAgora vou iniciar seus dados para seguirmos com a solicitação. ✅\n`;
  }

  return `Ótima escolha! 😊🛜\nEntão ficou:\n🚀 ${plan.name}\n💰 ${price}/mês\n\nAgora vou iniciar seus dados para seguirmos com a solicitação. ✅\n`;
}

function selectPlan(text: string, plans: PlanCandidate[]) {
  const normalized = normalizeText(text);

  const byId = plans.find((plan) => normalized.includes(normalizeText(plan.id)));
  if (byId) return byId;

  const byName = plans.find((plan) => {
    const name = normalizeText(plan.name);
    const speed = normalizeText(plan.speed);
    const shortTitle = normalizeText(planOptionTitle(plan));
    const description = normalizeText(planOptionDescription(plan));
    return normalized.includes(name) || normalized.includes(speed) || normalized.includes(shortTitle) || normalized.includes(description);
  });
  if (byName) return byName;

  const aliases = [
    { terms: ["200", "duzentos"], chip: false },
    { terms: ["350", "trezentos e cinquenta"], chip: false },
    { terms: ["400", "quatrocentos"], chip: false },
    { terms: ["500", "quinhentos"], chip: false },
    { terms: ["600", "seiscentos"], chip: false },
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

function applyParsedCustomerData(memory: ChatMemory, text: string, state: string) {
  const cep = parseCep(text);
  const document = parseDocument(text);
  const birthDate = parseBirthDate(text);
  const email = parseEmail(text);
  const billingDay = state === "ASK_BILLING_DUE_DAY" || state === "CORRECTION" ? parseBillingDay(text) : null;
  const name = extractNameFromText(text);

  if (cep) memory.cep = cep;
  if (document.valid) {
    memory.cpfCnpj = document.formatted;
    memory.documentType = document.type;
  }
  if (birthDate) memory.birthDate = birthDate.toISOString();
  if (email) memory.email = email;
  if (billingDay) memory.billingDueDay = billingDay;
  if ((state === "ASK_NAME" || state === "CORRECTION" || hasExplicitNameMarker(text)) && name) memory.name = name;
}

function extractNameFromText(text: string) {
  const withoutKnownData = text
    .replace(/\b\d{5}-?\d{3}\b/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/\b\d{1,2}[\/.\-\s]\d{1,2}[\/.\-\s]\d{2,4}\b/g, " ")
    .replace(/\b\d[\d.\-/\s]{9,}\d\b/g, " ")
    .replace(/\b(meu nome e|meu nome é|nome|sou|eu sou)\b/gi, " ")
    .trim();
  const words = withoutKnownData.split(/\s+/).filter((word) => /^[A-Za-zÀ-ÿ]{2,}$/.test(word));
  if (words.length < 2 || words.length > 5) return "";
  return toTitleCase(words.join(" "));
}

function hasExplicitNameMarker(text: string) {
  return /\b(meu nome e|meu nome é|nome|sou|eu sou)\b/i.test(text);
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

function asksWhyCpf(text: string) {
  const normalized = normalizeText(text);
  return normalized.includes("cpf") && /por que|porque|pra que|para que|precisa/.test(normalized);
}

function promptForState(state: string, firstName?: string) {
  const name = firstName ? `${firstName}, ` : "";
  const prompts: Record<string, string> = {
    ASK_CEP: "Para começar, pode me informar o CEP da instalação, por favor? 📍",
    ASK_STREET_NUMBER: "Me informe o número da residência.",
    ASK_COMPLEMENT: "Agora me informe se há complemento para o endereço.",
    ASK_ADDRESS_CONFIRM: "Agora me informe seu nome completo, por gentileza.",
    ASK_NAME: "Agora me informe seu nome completo, por gentileza.",
    ASK_DOCUMENT: `${name}me informe seu CPF, por favor.`,
    ASK_BIRTH_DATE: "Agora me informe sua data de nascimento no formato DD/MM/AAAA, por favor.",
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
    ASK_STREET_NUMBER: data.streetNumber ?? parseStreetNumberFromAddress(data.address),
    ASK_NAME: data.fullName,
    ASK_DOCUMENT: data.cpf,
    ASK_BIRTH_DATE: data.birthDate,
    ASK_EMAIL: data.email,
  };
  return values[state];
}

function parseStreetNumberFromAddress(address?: string) {
  if (!address) return "";
  const match = address.match(/\b(\d{1,6})\b/);
  return match?.[1] ?? "";
}

function hasUsefulExtractedDataForState(state: string, data?: ExtractedCustomerData) {
  return Boolean(extractedValueForState(state, data));
}

function applyExtractedAddress(memory: ChatMemory, data?: ExtractedCustomerData) {
  if (!data) return;
  applyAddress(memory, {
    street: data.address,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
  });
  if (!memory.streetNumber) {
    memory.streetNumber = data.streetNumber ?? parseStreetNumberFromAddress(data.address) ?? memory.streetNumber;
  }
}

function mediaFallbackReply(state: string, firstName?: string) {
  const replies: Record<string, string> = {
    ASK_CEP: "Recebi o comprovante, mas não consegui identificar o CEP com segurança. Pode me enviar o CEP digitado, por favor? 😊",
    ASK_STREET_NUMBER: "Recebi o comprovante, mas não consegui identificar com segurança o número da residência. Pode me enviar só o número, por favor? 😊",
    ASK_NAME: "Recebi o documento, mas não consegui confirmar com segurança o nome completo. Pode me escrever seu nome, por favor? 😊",
    ASK_DOCUMENT: "Recebi o documento, mas não consegui confirmar com segurança o CPF ou CNPJ. Pode me enviar digitado, por favor? 😊",
    ASK_BIRTH_DATE: "Recebi o documento, mas não consegui confirmar com segurança a data de nascimento. Pode me enviar no formato 26/01/1998, por favor? 😊",
    ASK_EMAIL: "Recebi o arquivo, mas não consegui identificar o e-mail com segurança. Pode me enviar digitado, por favor? 😊",
  };
  return replies[state] ?? `Recebi o arquivo, mas não consegui identificar com segurança o dado necessário.\n\n${promptForState(state, firstName)}`;
}

function parseCorrectionField(text: string): CorrectionField | undefined {
  const normalized = normalizeText(text);
  if (normalized === "1" || normalized.includes("nome")) return "name";
  if (normalized === "2" || normalized.includes("cpf") || normalized.includes("documento")) return "document";
  if (normalized === "3" || normalized.includes("nascimento") || normalized.includes("data")) return "birthDate";
  if (normalized === "4" || normalized.includes("email") || normalized.includes("e mail")) return "email";
  if (normalized === "5" || normalized.includes("endereco") || normalized.includes("cep") || normalized.includes("numero")) return "address";
  if (normalized === "6" || normalized.includes("vencimento") || normalized.includes("fatura")) return "billing";
  if (normalized === "7" || normalized.includes("plano")) return "plan";
  return undefined;
}

function isCorrectionChoiceOnly(text: string) {
  const normalized = normalizeText(text);
  return /^[1-7]$/.test(normalized) || [
    "nome", "cpf", "documento", "data de nascimento", "nascimento", "email", "e mail", "endereco", "cep", "vencimento", "plano",
  ].includes(normalized);
}

function correctionPrompt(field: CorrectionField) {
  const prompts: Record<CorrectionField, string> = {
    name: "Certo 😊 Me informe o nome completo correto.",
    document: "Certo 😊 Me informe o CPF correto.",
    birthDate: "Certo 😊 Me informe a data de nascimento correta no formato DD/MM/AAAA.",
    email: "Certo 😊 Me informe o e-mail correto.",
    address: "Certo 😊 Me informe o endereço correto. Pode enviar CEP, número e complemento.",
    billing: "Certo 😊 Qual vencimento você prefere: 5, 8, 10, 15, 20 ou 25?",
    plan: "Certo 😊 Qual plano você quer escolher?",
  };
  return prompts[field];
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

function planOptionTitle(plan: PlanCandidate) {
  const normalized = normalizeText(plan.name);
  if (normalized.includes("200 mega")) return "200 Mega";
  if (normalized.includes("350 mega")) return "350 Mega";
  if (normalized.includes("400 mega")) return "400 Mega";
  if (normalized.includes("500 mega")) return "500 Mega";
  if (normalized.includes("600 mega")) return "600 Mega";
  if (normalized.includes("1 giga")) return "1 Giga";
  return plan.name;
}

function planOptionDescription(plan: PlanCandidate) {
  const details = [];
  if (plan.description) details.push(plan.description.replace(/\s+\+\s+Globoplay.*$/i, "").trim());
  details.push(`${formatMoney(Number(plan.price))}/mês`);
  return details.join(" - ");
}

function interpolate(template: string, memory: ChatMemory, agentName?: string) {
  return template
    .replaceAll("{{agente}}", agentName || "Lily")
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
    hour < 12 ? "bom dia" : hour < 18 ? "boa tarde" : "boa noite";

  return `Olá, ${greeting}! 😊 Tudo bem?\nEu sou a ${agentName ?? "Lily"}, consultora de planos de internet fibra. 💙\nTrabalho com planos da Claro, Giga+ e Desktop e vou te ajudar a encontrar a melhor opção para sua casa. 🛜✨\n\nPara começar, pode me informar o CEP da instalação, por favor? 📍`;
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
