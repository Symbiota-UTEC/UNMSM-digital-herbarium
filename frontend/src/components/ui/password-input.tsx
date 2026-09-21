import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "./input";
import "./feedback.css";

/** Input de contraseña con el botón del ojo para ver lo que se escribe. */
function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} style={{ paddingRight: "2.5rem", ...props.style }} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center px-3 hb-icon-button text-muted-foreground"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}

export { PasswordInput };
