# Untitled Wheelbarrow Game

A small, friendly browser game in the spirit of Untitled Goose Game: you are a parent
on a sunny Saturday, giving wheelbarrow rides around a British country garden. Work
through the to-do list: deliver a child to the paddling pool, crate the windfall apples,
ride through the sprinkler, fetch the escaped duck back to its pond, peg the washing
back on the line, barrow the seedlings to the veg patch, sneak past the napping dog,
and get everyone to the picnic blanket in time for tea.

Step inside the greenhouse and you leave the barrow at the door for a scene of its
own: a little pipe-routing puzzle where you turn the irrigation joints until the
tap reaches the thirsty seedlings.

There is also some optional mischief to find, and the garden remembers how many
afternoons you have spent in it and how quickly you got everything done.

No build step, no dependencies, no assets. Plain ES modules, every sprite drawn on a
2D canvas, and all sound (birdsong, wheel squeaks, and the music) synthesized live
with WebAudio.

## Play

**[ianbutterworth.github.io/wheelbarrow](https://ianbutterworth.github.io/wheelbarrow/)**

Works in any modern browser, on desktop or a phone. Sound starts on your first
key press or tap.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | WASD, arrows, or drag | drag anywhere on the left |
| Trot | hold Shift | hold TROT |
| Load / tip out | Space or E | the big action button |
| To-do list | Tab or L | the tick tab |
| Pause and options | Esc or P | — |
| Mute | M | — |

Trotting through corners, over molehills, or along gravel wobbles the barrow. Too much
wobble and the passengers tumble out. They don't mind.

Pausing gives you a gentler-motion option (no camera shake or lean), a sound toggle,
and full key rebinding. Those settings, and your record, are kept in the browser.

## Running it locally

ES modules will not load over `file://`, so use any static server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Publishing

The site is the repository root, so there is no build step. In **Settings → Pages**,
set *Source* to **Deploy from a branch**, branch **main**, folder **/ (root)**. The
`.nojekyll` file stops GitHub trying to run the files through Jekyll.

## Code layout

Flat `src/` of ES modules, no framework:

| File | What it does |
|---|---|
| `main.js` | game loop, state machine (title / playing / ending), render passes |
| `player.js` | the articulated parent-and-barrow, wobble and spill model |
| `world.js` | the garden: paths, beds, props, surfaces, collision shapes |
| `tasks.js` | the to-do list, the extras, and their completion rules |
| `items.js` | the loose things the barrow can carry, and where each belongs |
| `greenhouse.js` | the greenhouse interior and its irrigation puzzle |
| `child.js`, `dog.js`, `grandparent.js` | the cast |
| `sprites.js` | every character and prop, drawn procedurally |
| `audio.js` | synthesized sound effects, ambience, and the generative music |
| `save.js` | settings, key bindings and your record, kept in localStorage |
| `physics.js`, `camera.js`, `input.js`, `ui.js`, `particles.js` | supporting systems |

Hold the backquote key while playing for a debug readout of speed, roll and cargo.
