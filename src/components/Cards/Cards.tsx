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
  gamePlayer,
  reorderDisabled = true,
  onReorder,
  onCardSelect,
}: {
  cards: Card[];
  isMe: boolean;
  gamePlayer?: GamePlayer;
  reorderDisabled?: boolean;
  onReorder?: (currentIndex: number, newIndex: number) => void;
  onCardSelect?: (card: Card) => void;
}) => {
  const [cardStyles, setCardStyles] = useState<Record<string, CSSProperties>>(
    {},
  );
  const ref: unknown = useRef(null);
  const { width, height } = useDimensions(ref as RefObject<HTMLElement>);
  const numsSelected = cards.filter((c) => c.selected).length;
  const selectedIndex = cards.findIndex((c) => c.selected);

  useEffect(() => {
    if (!cards.length || !width || !height) return;
    setTimeout(() => {
      const lastChild = (ref as RefObject<HTMLDivElement>)?.current
        ?.lastElementChild;
      let cardWidth = (lastChild as HTMLElement)?.offsetWidth;
      if (cardWidth === 0) {
        const cardHeight = (lastChild as HTMLElement)?.offsetHeight;
        cardWidth = (cardHeight * 18) / 25;
      }
      const result: Record<string, CSSProperties> = {};
      for (let index = 0; index < cards.length; index++) {
        result[index] = calStyle(cards.length, width, cardWidth, index);
      }
      setCardStyles(result);
    }, 10);
  }, [cards, width, height]);

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className={`card-list flex-1 max-w-full relative`}
    >
      {cards.map((card, idx) => (
        <OneCard
          key={card.rank + card.suit}
          index={idx}
          style={cardStyles[idx]}
          card={card}
          onClick={() => onCardSelect?.(card)}
          isMe={isMe}
          numsSelected={numsSelected}
          selectedIndex={selectedIndex}
          reorderDisabled={reorderDisabled}
          onReorder={(newIndex?: number) =>
            onReorder?.(selectedIndex, newIndex ?? idx)
          }
          isTiger={
            !!gamePlayer &&
            (cards.length === 1 || gamePlayer?.lastAction === "tiger")
              ? true
              : false
          }
        />
      ))}
    </div>
  );
};

function calStyle(
  totalCards: number,
  containerWidth: number,
  cardWidth: number,
  index: number,
): CSSProperties {
  const style: CSSProperties = {};
  const realWidth = totalCards * cardWidth;
  const px = (containerWidth - realWidth) / 2;
  if (px >= 0) {
    style.left = index * cardWidth + px + "px";
  } else {
    const each = (containerWidth - cardWidth) / (totalCards - 1);
    style.left = index * each + "px";
  }
  return style;
}

export default Cards;
