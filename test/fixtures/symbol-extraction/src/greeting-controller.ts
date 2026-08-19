import { EnglishGreeterService } from './english-greeter.service';
import { formatName } from './format-name';

export class GreetingController {
  constructor(private readonly greeter: EnglishGreeterService) {}

  handle(first: string, last: string): string {
    const name = formatName(first, last);
    return this.greeter.greet(name);
  }
}
