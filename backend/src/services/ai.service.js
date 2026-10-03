const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const openrouterService = require('./openrouter.service');
const knowledgeService = require('./knowledge.service');

// ============================================================
// Tom de voz por modo (ajuste fino do estilo, não do conteúdo)
// ============================================================

const TONE_GUIDANCE = {
  casual: 'Tom casual: próximo e leve, como uma conversa real de WhatsApp, mas ainda representando a empresa. Sem gírias forçadas.',
  confiante: 'Tom confiante: firme e seguro, direto ao ponto, transmitindo domínio do assunto, sem arrogância.',
  profissional: 'Tom profissional: cordial, claro e respeitoso, adequado a um atendimento formal, sem ser robótico.',
  direto: 'Tom direto: objetivo e curto, resolve o assunto rápido, sem rodeios nem cordialidade excessiva.'
};

const formatToneGuidance = (tone) => TONE_GUIDANCE[tone] || TONE_GUIDANCE.profissional;

// ============================================================
// Regras duras — é aqui que mora a precisão do bot
// ============================================================

// A regra de ouro: o modelo só pode afirmar o que está na base de
// conhecimento. Tudo o mais é "não sei" — nunca uma invenção
// plausível. Em atendimento, uma resposta inventada sobre prazo,
// preço ou status de pedido custa MUITO mais caro que uma resposta
// que admite precisar verificar.
const REGRAS_ANTI_ALUCINACAO = [
  'Use EXCLUSIVAMENTE as informações da BASE DE CONHECIMENTO acima. Ela é a única fonte de verdade sobre esta empresa.',
  'NUNCA invente nem estime: prazo de entrega, preço, valor de frete, código ou status de rastreio, disponibilidade de estoque, política de troca/garantia/reembolso, nome de produto, ou qualquer dado específico de um pedido.',
  'Se a informação necessária não estiver na base de conhecimento, NÃO improvise: escreva uma resposta que reconheça o pedido e diga que você vai verificar e retornar, e marque essa resposta com "confident": false.',
  'Nunca confirme que algo foi feito (envio, estorno, cancelamento, troca) se isso não estiver explicitamente na base ou na conversa.',
  'Não prometa nada em nome da empresa que não esteja escrito na base de conhecimento.'
];

const REGRAS_ESCALONAMENTO = [
  'Marque "confident": false sempre que o assunto envolver: reclamação grave, ameaça de processo ou órgão de defesa do consumidor, pedido de reembolso, cobrança indevida, dados pessoais/bancários, ou qualquer decisão que fuja das políticas cadastradas.',
  'Marque "confident": false quando a mensagem do cliente for ambígua a ponto de a resposta poder estar errada.'
];

const REGRAS_ESTILO = [
  'Escreva como uma pessoa real da equipe de atendimento — nunca como um assistente de IA.',
  'Nunca comece com frases de assistente como "Entendo", "Claro, posso ajudar", "Como assistente" ou "Peço desculpas pelo transtorno".',
  'Mensagens curtas, no ritmo do WhatsApp: 1 a 3 frases por resposta.',
  'As 3 opções devem ter aberturas e estruturas diferentes entre si — nunca repita a mesma primeira frase.',
  'Não repita literalmente a mensagem recebida, não use aspas, numeração, rótulos nem meta-comentários.',
  'Responda no mesmo idioma em que o cliente escreveu.'
];

const numerar = (regras) => regras.map((regra, i) => `${i + 1}. ${regra}`).join('\n');

// ============================================================
// Montagem do prompt
// ============================================================

const montarSystemPrompt = ({ profile, knowledgeBlock, hasKnowledge }, tone) => {
  const nomeEmpresa = profile.companyName || 'a empresa';

  const blocos = [
    `Você é um atendente humano da equipe de atendimento e pós-venda de ${nomeEmpresa}. ` +
      'Você está respondendo mensagens de clientes pelo WhatsApp. Suas respostas serão revisadas por ' +
      'um atendente humano antes de serem enviadas.'
  ];

  if (profile.toneOfVoice) {
    blocos.push(`TOM DE VOZ DA MARCA (siga sempre, em todas as respostas):\n${profile.toneOfVoice}`);
  }

  if (knowledgeBlock) {
    blocos.push(`BASE DE CONHECIMENTO:\n${knowledgeBlock}`);
  } else {
    blocos.push(
      'BASE DE CONHECIMENTO:\n(vazia — nenhuma informação sobre esta empresa foi cadastrada ainda)'
    );
  }

  if (profile.escalationNote) {
    blocos.push(`QUANDO PASSAR PARA UM HUMANO:\n${profile.escalationNote}`);
  }

  blocos.push(`REGRAS OBRIGATÓRIAS SOBRE O CONTEÚDO:\n${numerar(REGRAS_ANTI_ALUCINACAO)}`);
  blocos.push(`QUANDO MARCAR BAIXA CONFIANÇA:\n${numerar(REGRAS_ESCALONAMENTO)}`);
  blocos.push(`REGRAS DE ESTILO:\n${numerar(REGRAS_ESTILO)}`);
  blocos.push(formatToneGuidance(tone));

  if (!hasKnowledge) {
    // Sem base cadastrada o modelo não sabe NADA de concreto sobre a
    // empresa. Nesse cenário qualquer afirmação específica seria
    // invenção — então todas as respostas nascem como não confiáveis.
    blocos.push(
      'ATENÇÃO: a base de conhecimento está vazia. Você não sabe absolutamente nada de concreto sobre ' +
        'esta empresa, seus produtos, preços, prazos ou políticas. Gere apenas respostas de acolhimento ' +
        'e de encaminhamento ("vou verificar e já te retorno"), e marque TODAS as respostas com "confident": false.'
    );
  }

  blocos.push(
    'FORMATO DA SAÍDA — responda APENAS com um JSON válido, sem texto antes ou depois, no formato:\n' +
      '{"replies":[{"text":"...","confident":true},{"text":"...","confident":false,"reviewReason":"motivo curto"}]}\n' +
      'Sempre 3 objetos em "replies". O campo "reviewReason" (máx. 80 caracteres, em português) é obrigatório ' +
      'quando "confident" for false e explica ao atendente humano o que precisa ser verificado.'
  );

  return blocos.join('\n\n');
};

const formatarHistorico = (history) => {
  if (!Array.isArray(history) || !history.length) return '';
  return history
    .map((item) => `${item.outgoing ? 'Atendente' : 'Cliente'}: ${item.text}`)
    .join('\n');
};

// ============================================================
// Parsing tolerante da resposta do modelo
// ============================================================

const limparCercaDeCodigo = (texto) =>
  texto
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

// Alguns modelos escrevem uma frase antes do JSON. Em vez de desistir,
// tentamos recortar do primeiro "{" até o último "}".
const recortarJson = (texto) => {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim <= inicio) return null;
  return texto.slice(inicio, fim + 1);
};

const normalizarResposta = (item) => {
  const text = (typeof item === 'string' ? item : typeof item?.text === 'string' ? item.text : '').trim();
  if (!text) return null;

  // Ausência do campo é tratada como NÃO confiável de propósito: o
  // padrão seguro é pedir revisão humana, não presumir acerto.
  const confident = item?.confident === true;
  const reviewReason = String(item?.reviewReason || '').trim().slice(0, 120);

  return {
    text,
    confident,
    reviewReason: confident ? '' : reviewReason || 'Revise antes de enviar.'
  };
};

const parseReplies = (rawText) => {
  const limpo = limparCercaDeCodigo(rawText);

  for (const candidato of [limpo, recortarJson(limpo)]) {
    if (!candidato) continue;
    try {
      const json = JSON.parse(candidato);
      const lista = Array.isArray(json) ? json : json?.replies;
      if (Array.isArray(lista) && lista.length) {
        const respostas = lista.map(normalizarResposta).filter(Boolean).slice(0, 3);
        if (respostas.length) return respostas;
      }
    } catch {
      // tenta o próximo candidato
    }
  }

  // Último recurso: o modelo ignorou o formato e devolveu texto solto.
  // Aproveitamos as linhas, mas TODAS entram como não confiáveis —
  // se o modelo não seguiu a instrução de formato, não dá para
  // confiar que ele seguiu as regras de conteúdo.
  const linhas = limpo
    .split(/\r?\n/)
    .map((linha) => linha.replace(/^[-\d.)\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  return linhas.map((text) => ({
    text,
    confident: false,
    reviewReason: 'A IA não seguiu o formato esperado. Revise com atenção.'
  }));
};

// ============================================================
// Casos de uso
// ============================================================

async function generateReplies(userId, { text, history, tone }) {
  if (!text || !text.trim()) {
    throw ApiError.badRequest('Digite uma mensagem para gerar respostas.');
  }

  const contexto = await knowledgeService.buildContext(userId);
  const systemPrompt = montarSystemPrompt(contexto, tone);

  const transcricao = formatarHistorico(history);
  const blocoHistorico = transcricao
    ? `Histórico recente da conversa (mais antiga primeiro):\n${transcricao}\n\n`
    : '';

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        `${blocoHistorico}Última mensagem recebida do cliente:\n"${text.trim()}"\n\n` +
        'Gere as 3 respostas no formato JSON especificado.'
    }
  ];

  const raw = await openrouterService.chatCompletion(messages, {
    // Temperatura mais baixa que a versão original (era 0.85): em
    // atendimento, consistência vale mais que criatividade.
    temperature: 0.65,
    maxTokens: 800,
    responseFormat: { type: 'json_object' }
  });

  const replies = parseReplies(raw);
  if (!contexto.hasKnowledge) {
    replies.forEach((reply) => {
      reply.confident = false;
      reply.reviewReason = 'Base de conhecimento vazia. Verifique antes de enviar.';
    });
  }
  if (!replies.length) {
    throw ApiError.serviceUnavailable('Não foi possível gerar respostas. Tente novamente.');
  }

  return { replies, hasKnowledge: contexto.hasKnowledge };
}

const LANGUAGE_LABELS = {
  pt: 'Português',
  en: 'Inglês',
  es: 'Espanhol',
  fr: 'Francês',
  de: 'Alemão'
};

async function translateText(userId, { text, from, to }) {
  if (!text || !text.trim()) throw ApiError.badRequest('Digite um texto para traduzir.');
  if (from === to) return { text: text.trim() };

  const fromLabel = LANGUAGE_LABELS[from] || from;
  const toLabel = LANGUAGE_LABELS[to] || to;

  const messages = [
    {
      role: 'system',
      content:
        'Você é um tradutor profissional nativo em ambos os idiomas, que prioriza naturalidade sobre tradução literal. ' +
        'Responda apenas com o texto traduzido, sem comentários.'
    },
    {
      role: 'user',
      content: `Traduza de ${fromLabel} para ${toLabel}, preservando o tom:\n\n"${text.trim()}"`
    }
  ];

  const traduzido = await openrouterService.chatCompletion(messages, { temperature: 0.3, maxTokens: 600 });
  return { text: traduzido.replace(/^"|"$/g, '').trim() };
}

async function improveGrammar(userId, { text }) {
  if (!text || !text.trim()) throw ApiError.badRequest('Digite um texto para melhorar.');

  const contexto = await knowledgeService.buildContext(userId);
  const instrucaoTom = contexto.profile.toneOfVoice
    ? `Ajuste o texto ao tom de voz da marca:\n${contexto.profile.toneOfVoice}\n\n`
    : '';

  const messages = [
    {
      role: 'system',
      content:
        'Você é um revisor de texto experiente, que corrige gramática e clareza preservando o significado ' +
        'e a intenção originais. Nunca adicione informação nova ao texto.'
    },
    {
      role: 'user',
      content:
        `${instrucaoTom}Corrija a gramática e melhore a clareza do texto abaixo. ` +
        'Responda apenas com um JSON válido no formato ' +
        '{"corrected":"texto corrigido","suggestions":["sugestão 1","sugestão 2"]}.\n\n' +
        `Texto:\n"${text.trim()}"`
    }
  ];

  const raw = await openrouterService.chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 700,
    responseFormat: { type: 'json_object' }
  });

  const limpo = limparCercaDeCodigo(raw);
  for (const candidato of [limpo, recortarJson(limpo)]) {
    if (!candidato) continue;
    try {
      const json = JSON.parse(candidato);
      const corrected = String(json.corrected || json.text || '').trim();
      if (corrected) {
        return {
          corrected,
          suggestions: Array.isArray(json.suggestions)
            ? json.suggestions.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
            : []
        };
      }
    } catch {
      // tenta o próximo candidato
    }
  }

  return { corrected: limpo, suggestions: [] };
}

const describeModel = () => ({ model: env.openrouter.model, configured: env.isConfigured.openrouter });

module.exports = { generateReplies, translateText, improveGrammar, describeModel };
