import { OpenAiEmbeddingsProvider } from './openai-embeddings.provider';

describe('OpenAiEmbeddingsProvider', () => {
  let config: { get: jest.Mock };
  let provider: OpenAiEmbeddingsProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new OpenAiEmbeddingsProvider(config as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('throws without calling the API when OPENAI_API_KEY is missing', async () => {
    config.get.mockReturnValue(undefined);

    await expect(provider.embed('hello')).rejects.toThrow(/OPENAI_API_KEY is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the text and model to OpenAI and returns the embedding', async () => {
    config.get.mockImplementation(
      (key: string) =>
        ({
          'embeddings.openaiApiKey': 'sk-test',
          'embeddings.openaiModel': 'text-embedding-3-small',
        })[key],
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });

    const result = await provider.embed('hello world');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(options.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(options.body)).toEqual({
      input: 'hello world',
      model: 'text-embedding-3-small',
    });
  });

  it('throws with the response body when the request fails', async () => {
    config.get.mockReturnValue('sk-test');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    });

    await expect(provider.embed('hello')).rejects.toThrow(/401.*invalid api key/);
  });

  it('throws a clear error instead of returning undefined when the response has no data', async () => {
    config.get.mockReturnValue('sk-test');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });

    await expect(provider.embed('hello')).rejects.toThrow(/no data/);
  });
});
