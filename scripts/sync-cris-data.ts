import { prisma } from "@/lib/prisma";

const plans = [
  {
    name: "250 MEGA - Internet + Chip 35GB (Grátis)",
    speed: "250 Mega",
    price: 119.8,
    description: "Internet + Chip 35GB (Grátis) + Globoplay (GRÁTIS)",
    order: 1,
  },
  {
    name: "350 MEGA - Internet",
    speed: "350 Mega",
    price: 99.9,
    description: "Internet + Globoplay (GRÁTIS)",
    order: 2,
  },
  {
    name: "500 MEGA - Internet + Chip 35GB (Grátis)",
    speed: "500 Mega",
    price: 139.8,
    description: "Internet + Chip 35GB (Grátis) + Globoplay (GRÁTIS)",
    order: 3,
  },
  {
    name: "1 GIGA - Internet + Chip 35GB (Grátis)",
    speed: "1 Giga",
    price: 189.8,
    description: "Internet + Chip 35GB (Grátis) + Globoplay (GRÁTIS)",
    order: 4,
  },
  {
    name: "1 GIGA - Internet",
    speed: "1 Giga",
    price: 199.9,
    description: "Internet + Globoplay (GRÁTIS)",
    order: 5,
  },
] as const;

const legacyPlanNames = [
  "Plano legado 300 Mega",
  "Plano legado 500 Mega",
  "Plano legado 700 Mega",
  "Plano 350Mb",
  "Plano 500Mb",
  "Plano 1Gb",
  "Plano 250Mb",
  "Plano 250Mb + Chip",
  "Combo Hexa - 600 (Wi-Fi 600Mb + 35Gb celular)",
  "Plano 1Gb + Chip",
] as const;

const personality =
  "Nome: Joana. Genero/Sexo: Feminino. Cargo: Consultora Comercial da Claro. A Joana conversa como uma vendedora humana de WhatsApp. Seu objetivo e converter o maior numero possivel de leads vindos do Meta Ads em contratos da Claro. Ela e extremamente simpatica, extremamente vendedora, persuasiva, consultiva, educada, paciente, rapida, objetiva, cordial e bem humorada. Utiliza poucos emojis, nunca parece robo, nunca fala que e IA, nunca fala que e secretaria eletronica, nunca responde de maneira fria, adapta a resposta ao contexto da conversa e utiliza o nome do cliente quando ja souber.";

const rules = {
  memoria: "Sempre manter memoria persistente da conversa.",
  foraDoFluxo: "Quando responder uma pergunta fora do fluxo de mensagens de vendas, utilizar a OpenAI e voltar ao estado atual do fluxo.",
  precos: "Nunca inventar precos; sempre utilizar os planos cadastrados no banco de dados.",
  cobertura: "Nunca inventar cobertura; sempre utilizar a base de CEPs anexada no CRM.",
  etapas: "Nunca pular etapas; sempre respeitar o funil de fluxo de mensagens.",
  documentos: "Nunca pedir dois documentos ao mesmo tempo.",
  politica: "Nunca responder sobre assuntos politicos.",
  religiao: "Nunca responder sobre assuntos religiosos.",
  contexto: "Nunca conversar fora do contexto comercial.",
  venda: "Sempre conduzir para venda.",
  emojis: "Utilizar no maximo 1 emoji por mensagem.",
  objecoes:
    "Se o cliente nao quiser o plano, quebrar a objecao com vantagens da Claro por ate 3 tentativas. Apos 3 recusas responder: Entendo! Se mudar de ideia ou precisar de alguma informacao e so me avisar. 😁",
};

const flow = {
  steps: [
    {
      id: "start",
      state: "START",
      title: "Entrada Meta Ads",
      message:
        "Olá, bom dia/boa tarde/boa noite! Eu sou a Joana. Consultora da Claro, para verificar se na sua região tem cobertura, poderia me informar o CEP da instalação?",
    },
    {
      id: "cep",
      state: "ASK_CEP",
      title: "Consultar cobertura",
      message:
        "Consultar o CEP na base do CRM e complementar endereço com ViaCEP quando necessário. Se não houver cobertura, informar indisponibilidade e finalizar.",
    },
    {
      id: "street-number",
      state: "ASK_STREET_NUMBER",
      title: "Número da residência",
      message:
        "Com cobertura confirmada, pedir o número da residência.",
    },
    {
      id: "complement",
      state: "ASK_COMPLEMENT",
      title: "Complemento",
      message: "Perguntar se há complemento, como casa, apartamento ou bloco.",
    },
    {
      id: "address-confirm",
      state: "ASK_ADDRESS_CONFIRM",
      title: "Confirmação do endereço",
      message: "Confirmar o endereço completo cadastrado e pedir resposta SIM ou NÃO.",
    },
    {
      id: "name",
      state: "ASK_NAME",
      title: "Nome completo",
      message:
        "Com o endereço confirmado, pedir o nome completo do cliente.",
    },
    {
      id: "choose-plan",
      state: "CHOOSE_PLAN",
      title: "Escolha do plano",
      message:
        "Mostrar o botão Ver planos e, ao clicar, abrir uma lista clicável com os planos ativos e Globoplay grátis.",
    },
    {
      id: "document",
      state: "ASK_DOCUMENT",
      title: "CPF ou CNPJ",
      message: "Após a escolha do plano, pedir o CPF ou CNPJ e validar o documento.",
    },
    {
      id: "birth-date",
      state: "ASK_BIRTH_DATE",
      title: "Data de nascimento",
      message: "Com documento válido, pedir a data de nascimento do cliente.",
    },
    {
      id: "billing",
      state: "ASK_BILLING_DUE_DAY",
      title: "Vencimento",
      message:
        "Perguntar o melhor dia para vencimento da fatura: 5, 8, 10, 15, 20 ou 25.",
    },
    {
      id: "email",
      state: "ASK_EMAIL",
      title: "E-mail",
      message: "Pedir o e-mail para finalizar o cadastro.",
    },
    {
      id: "confirm",
      state: "CONFIRM_DATA",
      title: "Confirmação dos dados",
      message:
        "Exibir resumo completo com CEP, nome, documento, nascimento, endereço, e-mail, vencimento e plano. Se estiver correto, criar lead na aba Leads.",
    },
    {
      id: "finish",
      state: "FINISHED",
      title: "Finalização",
      message:
        "Perfeito! 🎉 Seus dados foram confirmados. Vou cadastrar aqui, deixa o celular ligado 📱, porque aprovando você receberá uma ligação da nossa central.",
    },
  ],
};

async function syncPlans() {
  await prisma.plan.updateMany({
    where: { name: { in: [...legacyPlanNames] }, deletedAt: null },
    data: { active: false, deletedAt: new Date() },
  });

  for (const plan of plans) {
    const existing = await prisma.plan.findFirst({
      where: { name: plan.name, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.plan.update({
        where: { id: existing.id },
        data: { ...plan, active: true, deletedAt: null },
      });
      continue;
    }

    await prisma.plan.create({ data: { ...plan, active: true } });
  }

  return prisma.plan.findMany({
    where: { deletedAt: null, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, price: true },
  });
}

async function syncJoana(planIds: string[]) {
  const existing = await prisma.agent.findFirst({
    where: { OR: [{ name: "Cris" }, { name: "Joana" }], deletedAt: null },
    select: { id: true },
  });

  const baseData = {
    name: "Joana",
    gender: "FEMALE",
    personality,
    rules,
    flow,
    active: true,
    minTypingSeconds: 2,
    maxTypingSeconds: 4,
    enableReadReceipt: true,
    enableTyping: true,
    enableReplyDelay: true,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    zapiBaseUrl: process.env.ZAPI_BASE_URL ?? "https://api.z-api.io",
    zapiInstanceId: process.env.ZAPI_INSTANCE_ID ?? "",
    zapiToken: process.env.ZAPI_TOKEN ?? "",
    zapiClientToken: process.env.ZAPI_CLIENT_TOKEN ?? "",
    zapiWhatsappNumber: process.env.ZAPI_WHATSAPP_NUMBER ?? "",
  };

  if (existing) {
    return prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...baseData,
        plans: { set: planIds.map((id) => ({ id })) },
      },
      include: { plans: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
    });
  }

  return prisma.agent.create({
    data: {
      ...baseData,
      plans: { connect: planIds.map((id) => ({ id })) },
    },
    include: { plans: { where: { deletedAt: null }, orderBy: { order: "asc" } } },
  });
}

async function main() {
  const activePlans = await syncPlans();
  const joana = await syncJoana(activePlans.map((plan) => plan.id));

  console.log(
    JSON.stringify(
      {
        activePlans: activePlans.map((plan) => ({ ...plan, price: Number(plan.price) })),
        joana: {
          id: joana.id,
          name: joana.name,
          openAiModel: joana.openAiModel,
          linkedPlans: joana.plans.map((plan) => plan.name),
          hasFlow: Boolean((joana.flow as { steps?: unknown[] } | null)?.steps?.length),
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
