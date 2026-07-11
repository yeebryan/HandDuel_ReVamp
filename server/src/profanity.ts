import { Filter } from 'bad-words';

const filter = new Filter();

export function filterProfanity(name: string): string {
  return filter.clean(name);
}
