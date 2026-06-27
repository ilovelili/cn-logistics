interface LogoMarkProps {
  alt?: string;
  className?: string;
  imageClassName?: string;
}

export default function LogoMark({
  alt = "CN Navigator",
  className = "h-10 w-10",
  imageClassName = "",
}: LogoMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-xl ${className}`}
    >
      <img
        src="/cn-logistics-logo.svg"
        alt={alt}
        className={`h-full w-full object-contain ${imageClassName}`}
      />
    </span>
  );
}
