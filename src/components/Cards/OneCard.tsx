/* eslint-disable @typescript-eslint/no-namespace */
type CardOptions = Partial<{
  rank: 0 | Rank | string;
  suit: Suit | "";
  backcolor: string;
  cid: string;
  bordercolor: string;
  borderline: number;
  borderradius: number;
  backtext: string;
  backtextcolor: string;
}>;
declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "playing-card": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > &
        CardOptions;
    }
  }
}
import {
  memo,
  type CSSProperties,
  type DetailedHTMLProps,
  type HTMLAttributes,
} from "react";
import "./OneCards.css";

const OneCard = ({
  style,
  card,
  isMe,
  isTiger,
  numsSelected,
  index,
  selectedIndex,
  reorderDisabled,
  onClick,
  onReorder,
}: {
  style: CSSProperties;
  card: Card;
  isMe: boolean;
  isTiger: boolean;
  numsSelected: number;
  index: number;
  selectedIndex: number;
  reorderDisabled: boolean;
  onClick: () => void;
  onReorder: (newIndex?: number) => void;
}) => {
  const selectedClassees = card.selected ? "selected" : "";
  const userCardClasses = isMe ? "cursor-pointer" : "";
  const classess = `${selectedClassees} ${userCardClasses}`
    .replace(/\s{2,}/, " ")
    .trim();
  const opponentTiger = !isMe && isTiger;
  const cardOptions: CardOptions = card.folded
    ? {
        rank: "0",
        suit: card.suit,
        backcolor: "#AEAEAE",
        bordercolor: opponentTiger ? "red" : "#AEAEAE",
        borderline: opponentTiger ? 2 : 1,
      }
    : {
        rank: card.rank,
        suit: card.suit,
        backcolor: "#AEAEAE",
        bordercolor: card.selected ? "green" : "#AEAEAE",
        borderline: card.selected ? 2 : 1,
      };

  const handleReorder = (e: React.MouseEvent, newIndex?: number) => {
    e.stopPropagation();
    onReorder(newIndex);
  };

  return (
    <div
      className={`card-item absolute z-4 h-full ${classess}`}
      onClick={() => onClick()}
      style={{ ...style, aspectRatio: "18/25" }}
    >
      {opponentTiger && (
        <div className="absolute z-5 top-0 left-0 bottom-0 right-0 flex items-center justify-center">
          <img className="w-[50%]" src="/logo.svg" alt="tiger" />
        </div>
      )}
      <playing-card {...cardOptions} />
      {!card.selected && !reorderDisabled && numsSelected === 1 && (
        <>
          {index !== selectedIndex - 1 && (
            <div
              className="h-full w-full z-6 absolute top-0 left-[30%] border rounded-sm lg:rounded-lg border-green-600 bg-green-300/50"
              onClick={handleReorder}
            ></div>
          )}
          {index === 0 && (
            <div
              className={`h-full w-full z-6 absolute top-0 ${selectedIndex === 1 ? "right-[30%]" : "right-[70%]"} border rounded-sm lg:rounded-lg border-green-600 bg-green-300/50`}
              onClick={(e) => handleReorder(e, -1)}
            ></div>
          )}
        </>
      )}
    </div>
  );
};

export default memo(OneCard);
