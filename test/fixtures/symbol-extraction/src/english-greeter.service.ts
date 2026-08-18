import { BaseGreeter } from './base-greeter';
import { Greeter } from './greeter.interface';

export class EnglishGreeterService extends BaseGreeter implements Greeter {
  /** Greets a person by their first name only, in English. */
  greet(name: string): string {
    return this.formatGreeting(name);
  }

  private formatGreeting(name: string): string {
    return `Hello, ${name}`;
  }
}
