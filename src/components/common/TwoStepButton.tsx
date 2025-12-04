import { useState, type PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  onConfirm: () => void;
}>;

const TwoStepButton = ({
  children,
  className,
  activeClassName,
  inactiveClassName,
  onConfirm,
}: Props) => {
  const [activated, setActivated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleAction = () => {
    if (confirmed) return;
    if (activated) {
      setConfirmed(true);
      return onConfirm();
    }
    setActivated(true);
  };

  return (
    <div
      className={`${className} ${activated ? activeClassName : inactiveClassName}`}
      onClick={handleAction}
    >
      {children}
    </div>
  );
};

export default TwoStepButton;
export type TwoStepButtonProps = Props;
