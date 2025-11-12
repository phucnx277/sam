import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useDimensions } from "@hooks/useDimensions";
import OneCard from "./OneCard";

const Cards = ({
  cards,
  isMe,
  onCardSelect,
}: {
  cards: Card[];
  isMe: boolean;
  onCardSelect: (card: Card) => void;
  onReorder?: (cards: Card[]) => void;
}) => {
  const [cardStyles, setCardStyles] = useState<Record<string, CSSProperties>>(
    {},
  );
  const ref: unknown = useRef(null);
  const { width } = useDimensions(ref as RefObject<HTMLElement>);
  useEffect(() => {
    if (!cards.length || !isMe) return;
    setTimeout(() => {
      const lastChild = (ref as RefObject<HTMLDivElement>)?.current
        ?.lastElementChild;
      const cardWidth = (lastChild as HTMLElement)?.offsetWidth;
      const result: Record<string, CSSProperties> = {};
      for (let index = 0; index < cards.length; index++) {
        result[index] = calStyle(cards.length, width, cardWidth, index);
      }
      setCardStyles(result);
    }, 10);
  }, [cards, width, isMe]);

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className={`flex flex-1 flex-row justify-center max-w-full relative`}
    >
      {cards.map((card, idx) => (
        <OneCard
          key={card.rank + card.suit}
          card={card}
          onClick={() => onCardSelect(card)}
          isMe={isMe}
          style={cardStyles[idx]}
          lastIndex={idx === cards.length - 1 ? idx : -1}
        />
      ))}
    </div>
  );
};

function calStyle(
  totalCards: number,
  containerWidth: number,
  childWidth: number,
  index: number,
): CSSProperties {
  const style: CSSProperties = {};
  const realWidth = totalCards * childWidth;
  const px = (containerWidth - realWidth) / 2;
  if (px >= 0) {
    style.left = index * childWidth + px + "px";
  } else {
    const each = (containerWidth - childWidth) / (totalCards - 1);
    style.left = index * each + "px";
  }
  return style;
}

export default Cards;
