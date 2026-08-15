import { BaseGreeter } from './base-greeter';
import { Greeter } from './greeter.interface';

export class EnglishGreeterService extends BaseGreeter implements Greeter {
  greet(name: string): string {
    return this.formatGreeting(name);
  }

  private formatGreeting(name: string): string {
    return `Hello, ${name}`;
  }
}
