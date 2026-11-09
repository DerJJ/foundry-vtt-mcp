import { CharacterService } from './services/characters.js';
import { CompendiumService } from './services/compendium.js';
import { WorldService } from './services/world.js';
import { AudioService } from './services/audio.js';
import { LibraryService } from './services/library.js';
import { JournalService } from './services/journals.js';
import { ActorService } from './services/actors.js';
import { ItemService } from './services/items.js';
import { RollService } from './services/rolls.js';
import { OwnershipService } from './services/ownership.js';
import { ChatService } from './services/chat.js';
import { TokenService } from './services/tokens.js';

/**
 * Composition root of the bridge's data access. Every category of operations lives in its own
 * service; queries call the services directly.
 */
export class FoundryDataAccess {
  readonly characters = new CharacterService();
  readonly compendium = new CompendiumService();
  readonly world = new WorldService(this);
  readonly audio = new AudioService();
  readonly library = new LibraryService();
  readonly journals = new JournalService(this);
  readonly actors = new ActorService(this);
  readonly items = new ItemService(this);
  readonly rolls = new RollService();
  readonly ownership = new OwnershipService(this);
  readonly chat = new ChatService(this);
  readonly tokens = new TokenService();
}
