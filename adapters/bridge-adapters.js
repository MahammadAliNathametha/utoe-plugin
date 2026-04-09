/**
 * Bridge adapters for tool hook payloads.
 *
 * Goal: normalize prompt capture/injection across Claude, Codex, Cursor.
 */

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function detectAdapterFromPayload(payload) {
  if (!isObject(payload)) return 'claude';

  if (typeof payload.prompt === 'string') return 'claude';
  if (typeof payload.input === 'string' || typeof payload.user_input === 'string') return 'codex';
  if (typeof payload.text === 'string' || typeof payload.command === 'string') return 'cursor';

  if (Array.isArray(payload.messages)) {
    const hasRole = payload.messages.some((m) => isObject(m) && typeof m.role === 'string');
    if (hasRole) return 'codex';
  }

  return 'claude';
}

function getPromptFromMessages(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!isObject(m)) continue;
    const role = String(m.role || '').toLowerCase();
    if (role === 'user' || role === 'human' || role === 'input') {
      const text = firstString(m.content, m.text, m.input);
      if (text) return text;
    }
  }
  return '';
}

const ADAPTERS = {
  claude: {
    capturePrompt(payload) {
      return firstString(
        payload?.prompt,
        payload?.input,
        payload?.text,
        getPromptFromMessages(payload?.messages),
      );
    },
    injectOptimizedPrompt(payload, optimizedPrompt) {
      if (typeof payload.prompt === 'string') {
        return { ...payload, prompt: optimizedPrompt };
      }
      if (typeof payload.input === 'string') {
        return { ...payload, input: optimizedPrompt };
      }
      return { ...payload, prompt: optimizedPrompt };
    },
  },

  codex: {
    capturePrompt(payload) {
      return firstString(
        payload?.input,
        payload?.user_input,
        payload?.prompt,
        getPromptFromMessages(payload?.messages),
      );
    },
    injectOptimizedPrompt(payload, optimizedPrompt) {
      if (typeof payload.input === 'string') {
        return { ...payload, input: optimizedPrompt };
      }
      if (typeof payload.user_input === 'string') {
        return { ...payload, user_input: optimizedPrompt };
      }
      if (Array.isArray(payload.messages)) {
        const messages = [...payload.messages];
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const m = messages[i];
          if (!isObject(m)) continue;
          const role = String(m.role || '').toLowerCase();
          if (role === 'user' || role === 'human' || role === 'input') {
            messages[i] = { ...m, content: optimizedPrompt };
            return { ...payload, messages };
          }
        }
      }
      return { ...payload, input: optimizedPrompt };
    },
  },

  cursor: {
    capturePrompt(payload) {
      return firstString(
        payload?.text,
        payload?.command,
        payload?.prompt,
        payload?.input,
      );
    },
    injectOptimizedPrompt(payload, optimizedPrompt) {
      if (typeof payload.text === 'string') {
        return { ...payload, text: optimizedPrompt };
      }
      if (typeof payload.command === 'string') {
        return { ...payload, command: optimizedPrompt };
      }
      if (typeof payload.prompt === 'string') {
        return { ...payload, prompt: optimizedPrompt };
      }
      return { ...payload, text: optimizedPrompt };
    },
  },
};

export function resolveBridgeAdapter(payload, explicitName = '') {
  const name = String(explicitName || detectAdapterFromPayload(payload)).toLowerCase();
  return ADAPTERS[name] || ADAPTERS.claude;
}

export function detectBridgeAdapter(payload) {
  return detectAdapterFromPayload(payload);
}
