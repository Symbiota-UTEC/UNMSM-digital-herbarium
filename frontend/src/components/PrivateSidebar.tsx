import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Folder,
  LayoutDashboard,
  Leaf,
  List,
  LogOut,
  Map,
  MapPin,
  Shield,
  Upload,
  User,
  ChevronDown,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@contexts/AuthContext";
import { Role } from "@constants/roles";

interface PrivateSidebarProps {
  onNavigate: (page: string) => void;
  currentPage: string;
}

type NavLeaf = { id: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; icon: LucideIcon; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => "children" in entry;

const BG = "#1f0909";
const BG_HOVER = "#2e1010";
const BG_ACTIVE = "#8b2323";
const TEXT_MUTED = "rgba(255,255,255,0.6)";

export function PrivateSidebar({ onNavigate, currentPage }: PrivateSidebarProps) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const isSuperuser = user?.role === Role.Admin;
  const isAdmin = user?.role === Role.InstitutionAdmin || user?.role === Role.Admin;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const entries: NavEntry[] = [
    { id: "collections", label: "Colecciones", icon: Folder },
    {
      label: "Ocurrencias",
      icon: MapPin,
      children: [
        { id: "occurrences", label: "Listado", icon: List },
        { id: "map", label: "Mapa", icon: Map },
      ],
    },
    { id: "taxon", label: "Taxon", icon: Leaf },
    {
      label: "Admin",
      icon: Shield,
      children: [
        ...(isAdmin ? [{ id: "admin", label: "Panel", icon: LayoutDashboard }] : []),
        ...(isSuperuser ? [{ id: "uploads", label: "Cargas", icon: Upload }] : []),
      ],
    },
  ].flatMap((entry): NavEntry[] => {
    if (!isGroup(entry)) return [entry];
    // Un grupo sin subitems visibles se omite; con uno solo se muestra como ítem simple.
    if (entry.children.length === 0) return [];
    if (entry.children.length === 1) return [{ ...entry.children[0], label: entry.label, icon: entry.icon }];
    return [entry];
  });

  const isActive = (id: string) => currentPage === id || currentPage.startsWith(id + "-");

  const handleProfileNavigate = () => onNavigate("profile");
  const handleLogout = () => {
    logout();
    onNavigate("home");
  };

  // Text fade: when collapsing, hide fast (no delay); when expanding, appear after width opens
  const labelStyle: CSSProperties = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : undefined,
    transform: collapsed ? "translateX(-6px)" : "translateX(0)",
    transition: collapsed
      ? "opacity 150ms ease, transform 150ms ease, width 300ms ease"
      : "opacity 200ms ease 180ms, transform 200ms ease 180ms",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    flexShrink: 0,
  };

  // Estilo común de los botones del menú (ítems, cabeceras de grupo y subitems).
  const navButtonProps = (active: boolean, compact = false) => ({
    className: `flex items-center w-full rounded-lg ${compact ? "py-2" : "py-3"} text-sm font-medium text-white`,
    style: {
      background: active ? BG_ACTIVE : "transparent",
      transition: "background 150ms ease",
      justifyContent: collapsed ? "center" : "flex-start",
      gap: collapsed ? 0 : compact ? "0.5rem" : "0.75rem",
      paddingLeft: collapsed ? 0 : compact ? "0.5rem" : "0.75rem",
      paddingRight: collapsed ? 0 : compact ? "0.5rem" : "0.75rem",
    } as CSSProperties,
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      if (!active) e.currentTarget.style.background = BG_HOVER;
    },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
      if (!active) e.currentTarget.style.background = "transparent";
    },
  });

  return (
    <aside
      className="relative flex flex-col shrink-0 transition-[width] duration-300 ease-in-out"
      style={{ width: collapsed ? "64px" : "220px", background: BG }}
    >
      {/* Toggle arrow — rotates smoothly */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md border border-gray-200 hover:bg-gray-100 transition-colors"
        style={{ top: "34px", right: "-12px", transform: "translateY(-50%)" }}
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      >
        <ChevronLeft
          className="h-3.5 w-3.5 text-gray-600"
          style={{
            transition: "transform 300ms ease",
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 shrink-0" style={{ height: "68px" }}>
        <Leaf className="h-7 w-7 shrink-0 text-white" />
        <span className="text-base font-semibold text-white leading-tight" style={labelStyle}>
          Herbario Digital
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 shrink-0" style={{ height: "1px", background: "rgba(255,255,255,0.2)" }} />

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3 py-3 flex-1 min-h-0 overflow-y-auto">
        {entries.map((entry) => {
          if (!isGroup(entry)) {
            return (
              <button
                key={entry.id}
                onClick={() => onNavigate(entry.id)}
                title={collapsed ? entry.label : undefined}
                {...navButtonProps(isActive(entry.id))}
              >
                <entry.icon className="h-5 w-5 shrink-0" />
                <span style={labelStyle}>{entry.label}</span>
              </button>
            );
          }

          const childActive = entry.children.some((c) => isActive(c.id));
          const open = openGroups[entry.label] ?? childActive;
          const GroupIcon = entry.icon;

          // Colapsado: solo el ícono, y los subitems salen en un menú lateral.
          if (collapsed) {
            return (
              <DropdownMenu key={entry.label}>
                <DropdownMenuTrigger asChild>
                  <button title={entry.label} {...navButtonProps(childActive)}>
                    <GroupIcon className="h-5 w-5 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-44">
                  <DropdownMenuLabel>{entry.label}</DropdownMenuLabel>
                  {entry.children.map((child) => (
                    <DropdownMenuItem
                      key={child.id}
                      onClick={() => onNavigate(child.id)}
                      className="gap-3 cursor-pointer"
                    >
                      <child.icon className="h-4 w-4" />
                      {child.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <div key={entry.label} className="flex flex-col gap-1">
              <button
                onClick={() => setOpenGroups((g) => ({ ...g, [entry.label]: !open }))}
                aria-expanded={open}
                {...navButtonProps(childActive && !open)}
              >
                <GroupIcon className="h-5 w-5 shrink-0" />
                <span style={labelStyle}>{entry.label}</span>
                <ChevronDown
                  className="ml-auto h-4 w-4 shrink-0"
                  style={{
                    transition: "transform 200ms ease",
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    color: TEXT_MUTED,
                  }}
                />
              </button>
              {open && (
                <div
                  className="flex flex-col gap-1"
                  style={{
                    marginLeft: "1.35rem",
                    paddingLeft: "0.5rem",
                    borderLeft: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {entry.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => onNavigate(child.id)}
                      {...navButtonProps(isActive(child.id), true)}
                    >
                      <child.icon className="h-4 w-4 shrink-0" />
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 shrink-0" style={{ height: "1px", background: "rgba(255,255,255,0.2)" }} />

      {/* Footer */}
      <div className="px-3 py-3 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center w-full rounded-lg py-2 transition-colors"
              style={{
                gap: collapsed ? 0 : "0.75rem",
                paddingLeft: collapsed ? 0 : "0.75rem",
                paddingRight: collapsed ? 0 : "0.75rem",
                justifyContent: collapsed ? "center" : "flex-start",
                transition: "gap 300ms ease, padding 300ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = BG_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs font-semibold" style={{ background: BG_ACTIVE, color: "white" }}>
                  {user?.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden text-left" style={labelStyle}>
                <span className="text-sm font-medium text-white truncate">{user?.username}</span>
                <span className="text-xs truncate" style={{ color: TEXT_MUTED }}>
                  {user?.email}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align="start" className="w-52 mb-1">
            <DropdownMenuItem onClick={handleProfileNavigate} className="gap-3 cursor-pointer">
              <User className="h-4 w-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="gap-3 cursor-pointer text-red-600 focus:text-red-600">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
