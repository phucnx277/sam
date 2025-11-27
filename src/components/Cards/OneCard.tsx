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
  onClick,
}: {
  style: CSSProperties;
  card: Card;
  isMe: boolean;
  isTiger: boolean;
  onClick: () => void;
}) => {
  const selectedClassees = card.selected ? "selected" : "";
  const userCardClasses = isMe ? "cursor-pointer" : "";
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
  return (
    <div
      className={`card-item absolute z-4 h-full overflow-hidden ${selectedClassees} ${userCardClasses}`}
      onClick={() => onClick()}
      style={{ ...style, aspectRatio: "18/25" }}
    >
      {opponentTiger && (
        <div className="absolute top-0 left-0 bottom-0 right-0 flex items-center justify-center text-3xl lg:text-6xl">
          🐆
        </div>
      )}
      <playing-card {...cardOptions} />
    </div>
  );
};

export default memo(OneCard);
