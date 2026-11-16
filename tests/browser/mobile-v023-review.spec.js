import { manualSteamReviewTest, modeAndSaveReviewTests } from './v023Review.js';

modeAndSaveReviewTests();
for (const viewport of [{ width: 320, height: 740 }, { width: 393, height: 851 }, { width: 851, height: 393 }]) {
  manualSteamReviewTest(viewport);
}
