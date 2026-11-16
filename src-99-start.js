/**
 * @file Start-up.
 * Runs last, after every module has defined its state, so the first render sees all layers.
 *
 * Module 30 of 30. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

setButtons();
render();
aiSet(AI_ON);
