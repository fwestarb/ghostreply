// Um único canal para conta, IA e dados da empresa.
const GhostReplyMessaging = {
  send(type, payload) {
    return new Promise((resolve, reject) => {
      const reloadMessage = 'A comunicação do GhostReply foi interrompida. Recarregue a extensão em chrome://extensions e depois atualize esta página.';
      let finished = false;
      const timeout = setTimeout(() => {
        finished = true;
        reject(new Error('O GhostReply não recebeu uma resposta. Confira se o backend está aberto e tente novamente.'));
      }, type === 'AUTH_GOOGLE' ? 300000 : 75000);
      const complete = (error, data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (error) reject(error); else resolve(data);
      };
      try {
        if (!chrome.runtime?.id) throw new Error(reloadMessage);
        chrome.runtime.sendMessage({ type, payload }, (response) => {
          const failure = chrome.runtime.lastError?.message;
          if (failure) {
            complete(new Error(/port closed|receiving end|context invalidated|message channel/i.test(failure) ? reloadMessage : failure));
          } else if (!response?.ok) {
            complete(new Error(response?.error || reloadMessage));
          } else {
            complete(null, response.data);
          }
        });
      } catch (error) {
        complete(new Error(/context invalidated/i.test(error.message) ? reloadMessage : error.message));
      }
    });
  }
};
