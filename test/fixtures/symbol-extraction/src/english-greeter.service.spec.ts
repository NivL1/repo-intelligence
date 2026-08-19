import { EnglishGreeterService } from './english-greeter.service';

// Top-level function that WOULD be picked up as a symbol if the extractor
// didn't filter out .spec.ts files — this is what symbol-extractor.spec.ts
// asserts is absent, so that exclusion is actually proven, not assumed.
function buildService(): EnglishGreeterService {
  return new EnglishGreeterService();
}

describe('EnglishGreeterService', () => {
  it('greets', () => {
    expect(buildService().greet('World')).toBe('Hello, World');
  });
});
