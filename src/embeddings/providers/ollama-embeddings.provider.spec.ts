import { OllamaEmbeddingsProvider } from './ollama-embeddings.provider';

describe('OllamaEmbeddingsProvider', () => {
  let config: { get: jest.Mock };
  let provider: OllamaEmbeddingsProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new OllamaEmbeddingsProvider(config as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('falls back to localhost:11434 and nomic-embed-text when unconfigured', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ embedding: [1, 2, 3] }) });

    await provider.embed('hello');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embeddings');
    expect(JSON.parse(options.body)).toEqual({ model: 'nomic-embed-text', prompt: 'hello' });
  });

  it('uses the configured base URL and model', async () => {
    config.get.mockImplementation(
      (key: string) =>
        ({
          'embeddings.ollamaBaseUrl': 'http://ollama.internal:11434',
          'embeddings.ollamaModel': 'mxbai-embed-large',
        })[key],
    );
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ embedding: [0.5] }) });

    const result = await provider.embed('hello');

    expect(result).toEqual([0.5]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama.internal:11434/api/embeddings');
    expect(JSON.parse(options.body)).toEqual({ model: 'mxbai-embed-large', prompt: 'hello' });
  });

  it('throws with the response body when the request fails', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    });

    await expect(provider.embed('hello')).rejects.toThrow(/404.*model not found/);
  });

  it('throws a clear error instead of returning undefined when the response has no embedding field', async () => {
    config.get.mockReturnValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(provider.embed('hello')).rejects.toThrow(/no embedding field/);
  });
});
