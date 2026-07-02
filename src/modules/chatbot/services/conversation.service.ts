import { ChatbotRepository } from "@/repositories/chatbot.repository";

export class ConversationService {
  constructor(private readonly chatbotRepository = new ChatbotRepository()) {}

  async list() {
    return this.chatbotRepository.listConversations();
  }
}
