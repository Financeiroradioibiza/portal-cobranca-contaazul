type Props = {
  size?: "sm" | "md";
  className?: string;
};

/** Wordmark «Radio Ibiza» colorido — igual ao player / e-mails de instalação. */
export function RadioIbizaWordmark({ size = "md", className = "" }: Props) {
  const textSize = size === "sm" ? "text-sm" : "text-base";
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-extrabold leading-none ${textSize} ${className}`}
      aria-label="Radio Ibiza"
    >
      <span className="bg-gradient-to-r from-[#ff7a45] to-[#ff4d8d] bg-clip-text text-transparent">
        Radio
      </span>
      <span className="bg-gradient-to-r from-[#4dd0e1] to-[#66d98c] bg-clip-text text-transparent">
        Ibiza
      </span>
    </span>
  );
}
