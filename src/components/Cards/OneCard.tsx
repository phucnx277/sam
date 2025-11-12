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
  card,
  isMe,
  style,
  lastIndex,
  onClick,
}: {
  card: Card;
  isMe: boolean;
  style: CSSProperties;
  lastIndex: number;
  onClick: () => void;
}) => {
  const selectedClassees = card.selected ? "selected" : "";
  const userCardClasses = isMe ? "cursor-pointer" : "";
  const opponentTiger = !isMe && lastIndex === 0;
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
      className={`flex absolute h-full overflow-hidden card-wrapper ${selectedClassees} ${userCardClasses}`.trimEnd()}
      onClick={() => onClick()}
      style={style}
    >
      <playing-card {...cardOptions} />
    </div>
  );
};

export default memo(OneCard);
