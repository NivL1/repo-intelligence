import { OllamaLlmProvider } from './ollama-llm.provider';

describe('OllamaLlmProvider', () => {
  let config: { get: jest.Mock };
  let provider: OllamaLlmProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new OllamaLlmProvider(config as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('falls back to localhost:11434 and llama3.2 when unconfigured', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response: 'hi there' }) });

    await provider.complete('hello');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    expect(JSON.parse(options.body)).toEqual({ model: 'llama3.2', prompt: 'hello', stream: false });
  });

  it('uses the configured base URL and model', async () => {
    config.get.mockImplementation(
      (key: string) =>
        ({
          'llm.ollamaBaseUrl': 'http://ollama.internal:11434',
          'llm.ollamaModel': 'qwen2.5:3b',
        })[key],
    );
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response: 'answer' }) });

    const result = await provider.complete('hello');

    expect(result).toBe('answer');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama.internal:11434/api/generate');
    expect(JSON.parse(options.body)).toEqual({
      model: 'qwen2.5:3b',
      prompt: 'hello',
      stream: false,
    });
  });

  it('throws with the response body when the request fails', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    });

    await expect(provider.complete('hello')).rejects.toThrow(/404.*model not found/);
  });

  it('throws a clear error instead of returning undefined when the response has no text', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(provider.complete('hello')).rejects.toThrow(/no text/);
  });
});
