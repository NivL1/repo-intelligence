import { OpenAiLlmProvider } from './openai-llm.provider';

describe('OpenAiLlmProvider', () => {
  let config: { get: jest.Mock };
  let provider: OpenAiLlmProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new OpenAiLlmProvider(config as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  it('throws without calling the API when OPENAI_API_KEY is missing', async () => {
    config.get.mockReturnValue(undefined);

    await expect(provider.complete('hello')).rejects.toThrow(/OPENAI_API_KEY is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the prompt and model to OpenAI and returns the completion', async () => {
    config.get.mockImplementation(
      (key: string) =>
        ({
          'llm.openaiApiKey': 'sk-test',
          'llm.openaiModel': 'gpt-4o-mini',
        })[key],
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'the answer' } }] }),
    });

    const result = await provider.complete('a question');

    expect(result).toBe('the answer');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(options.body)).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'a question' }],
    });
  });

  it('throws with the response body when the request fails', async () => {
    config.get.mockReturnValue('sk-test');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    });

    await expect(provider.complete('hello')).rejects.toThrow(/401.*invalid api key/);
  });

  it('throws a clear error instead of returning undefined when the response has no content', async () => {
    config.get.mockReturnValue('sk-test');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });

    await expect(provider.complete('hello')).rejects.toThrow(/no content/);
  });
});
