import { useState } from "react";
import useI18n from "@hooks/useI18n";
import type { TranslationKey } from "@logic/i18n";

type Section = { titleKey: TranslationKey; itemKeys: TranslationKey[] };

const rulesSections: Section[] = [
  {
    titleKey: "howToPlay.rules.setup",
    itemKeys: ["howToPlay.rules.setup1", "howToPlay.rules.setup2"],
  },
  {
    titleKey: "howToPlay.rules.plays",
    itemKeys: [
      "howToPlay.rules.plays1",
      "howToPlay.rules.plays2",
      "howToPlay.rules.plays3",
      "howToPlay.rules.plays4",
    ],
  },
  {
    titleKey: "howToPlay.rules.turns",
    itemKeys: [
      "howToPlay.rules.turns1",
      "howToPlay.rules.turns2",
      "howToPlay.rules.turns3",
    ],
  },
  {
    titleKey: "howToPlay.rules.calls",
    itemKeys: [
      "howToPlay.rules.calls1",
      "howToPlay.rules.calls2",
      "howToPlay.rules.calls3",
      "howToPlay.rules.calls4",
    ],
  },
  {
    titleKey: "howToPlay.rules.chips",
    itemKeys: [
      "howToPlay.rules.chips1",
      "howToPlay.rules.chips2",
      "howToPlay.rules.chips3",
      "howToPlay.rules.chips4",
    ],
  },
  {
    titleKey: "howToPlay.rules.village",
    itemKeys: ["howToPlay.rules.village1"],
  },
  {
    titleKey: "howToPlay.rules.star",
    itemKeys: ["howToPlay.rules.star1", "howToPlay.rules.star2"],
  },
];

const gestureSections: Section[] = [
  {
    titleKey: "howToPlay.gestures.flip",
    itemKeys: ["howToPlay.gestures.flip1", "howToPlay.gestures.flip2"],
  },
  {
    titleKey: "howToPlay.gestures.select",
    itemKeys: ["howToPlay.gestures.select1"],
  },
  {
    titleKey: "howToPlay.gestures.sort",
    itemKeys: ["howToPlay.gestures.sort1", "howToPlay.gestures.sort2"],
  },
  {
    titleKey: "howToPlay.gestures.reorder",
    itemKeys: ["howToPlay.gestures.reorder1", "howToPlay.gestures.reorder2"],
  },
  {
    titleKey: "howToPlay.gestures.buttons",
    itemKeys: ["howToPlay.gestures.buttons1"],
  },
];

const HowToPlay = ({ onClose }: { onClose: () => void }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<"rules" | "gestures">("rules");
  const sections = tab === "rules" ? rulesSections : gestureSections;

  return (
    <div className="fixed z-10 top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-white flex flex-col p-4 lg:p-8 rounded-lg shadow-2xl shadow-gray-400 w-[30rem] max-w-[92%] max-h-[90%]">
        <div className="text-center text-lg font-semibold">
          {t("howToPlay.title")}
        </div>
        <div className="flex justify-center gap-x-2 mt-3">
          <button
            type="button"
            className={`!py-1 !px-3 text-sm border ${tab === "rules" ? "border-cyan-600 bg-cyan-300" : "border-cyan-300 hover:bg-cyan-300"}`}
            onClick={() => setTab("rules")}
          >
            {t("howToPlay.rulesTab")}
          </button>
          <button
            type="button"
            className={`!py-1 !px-3 text-sm border ${tab === "gestures" ? "border-cyan-600 bg-cyan-300" : "border-cyan-300 hover:bg-cyan-300"}`}
            onClick={() => setTab("gestures")}
          >
            {t("howToPlay.gesturesTab")}
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pr-1 flex flex-col gap-y-4">
          {sections.map((section) => (
            <div key={section.titleKey}>
              <div className="font-semibold">{t(section.titleKey)}</div>
              <ul className="list-disc pl-5 mt-1 flex flex-col gap-y-1 text-sm">
                {section.itemKeys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-4">
          <button
            type="button"
            className="!px-0 border border-gray-300 hover:bg-gray-300 active:bg-gray-300 focus:bg-gray-300 w-[8rem]"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HowToPlay;
