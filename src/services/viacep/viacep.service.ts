import { onlyDigits } from "@/utils/mask";

type ViaCepResponse = {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

export class ViaCepService {
  async findAddress(cep: string) {
    const digits = onlyDigits(cep).slice(0, 8);
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      throw new Error("Falha ao consultar ViaCEP.");
    }

    const data = (await response.json()) as ViaCepResponse;
    if (data.erro) {
      return null;
    }

    return {
      cep: onlyDigits(data.cep),
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
    };
  }
}
