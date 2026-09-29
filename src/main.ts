import { Game } from './game/Game';

const container = document.getElementById('game-container');
if (!container) throw new Error('Missing #game-container');
const game = new Game(container);
game.showTitle();
