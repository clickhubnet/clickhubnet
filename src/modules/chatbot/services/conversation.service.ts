import { ChatbotRepository } from "@/repositories/chatbot.repository";

export class ConversationService {
  constructor(private readonly chatbotRepository = new ChatbotRepository()) {}

  async list() {
    return this.chatbotRepository.listConversations();
  }

  async get(id: string) {
    return this.chatbotRepository.findConversationById(id);
  }

  async create(input: { phone: string; name?: string; assignedTo?: string; ownerUserId?: string }) {
    return this.chatbotRepository.createManualConversation(input);
  }

  async update(input: { id: string; name?: string; assignedTo?: string; tags?: unknown; state?: string; blocked?: boolean }) {
    return this.chatbotRepository.updateManualConversation(input);
  }

  async delete(id: string) {
    return this.chatbotRepository.softDeleteConversation(id);
  }
}
