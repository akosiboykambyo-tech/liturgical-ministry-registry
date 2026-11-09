/**
 * COWL-DOK Phosphor icon layer.
 * Light is the default; compact status and critical controls can pass weight="regular".
 * Existing application icon names are retained as migration aliases only.
 */
import * as React from "react";
import type { Icon, IconProps } from "@phosphor-icons/react";
import {
  ArchiveIcon as PhosphorArchive,
  ArrowCounterClockwiseIcon as PhosphorArrowCounterClockwise,
  ArrowLeftIcon as PhosphorArrowLeft,
  ArrowRightIcon as PhosphorArrowRight,
  ArrowSquareOutIcon as PhosphorArrowSquareOut,
  ArrowsClockwiseIcon as PhosphorArrowsClockwise,
  CalendarDotsIcon as PhosphorCalendarDots,
  CaretDownIcon as PhosphorCaretDown,
  CaretLeftIcon as PhosphorCaretLeft,
  CaretRightIcon as PhosphorCaretRight,
  CaretUpIcon as PhosphorCaretUp,
  CaretUpDownIcon as PhosphorCaretUpDown,
  CertificateIcon as PhosphorCertificate,
  CheckIcon as PhosphorCheck,
  CheckCircleIcon as PhosphorCheckCircle,
  CheckSquareIcon as PhosphorCheckSquare,
  ChecksIcon as PhosphorChecks,
  CircleIcon as PhosphorCircle,
  CircleNotchIcon as PhosphorCircleNotch,
  ClipboardTextIcon as PhosphorClipboardText,
  ClockIcon as PhosphorClock,
  ClockCounterClockwiseIcon as PhosphorClockCounterClockwise,
  CopyIcon as PhosphorCopy,
  DotsThreeVerticalIcon as PhosphorDotsThreeVertical,
  DownloadSimpleIcon as PhosphorDownloadSimple,
  EnvelopeIcon as PhosphorEnvelope,
  EyeIcon as PhosphorEye,
  FileArrowDownIcon as PhosphorFileArrowDown,
  FileTextIcon as PhosphorFileText,
  FileXlsIcon as PhosphorFileXls,
  FilesIcon as PhosphorFiles,
  FloppyDiskIcon as PhosphorFloppyDisk,
  HourglassIcon as PhosphorHourglass,
  FunnelIcon as PhosphorFunnel,
  GearSixIcon as PhosphorGearSix,
  GitMergeIcon as PhosphorGitMerge,
  ImageIcon as PhosphorImage,
  ListIcon as PhosphorList,
  LockIcon as PhosphorLock,
  MagnifyingGlassIcon as PhosphorMagnifyingGlass,
  MegaphoneIcon as PhosphorMegaphone,
  MinusCircleIcon as PhosphorMinusCircle,
  PencilLineIcon as PhosphorPencilLine,
  PencilSimpleIcon as PhosphorPencilSimple,
  PlusIcon as PhosphorPlus,
  PrinterIcon as PhosphorPrinter,
  QrCodeIcon as PhosphorQrCode,
  ShieldCheckIcon as PhosphorShieldCheck,
  ShieldWarningIcon as PhosphorShieldWarning,
  SignOutIcon as PhosphorSignOut,
  SlidersHorizontalIcon as PhosphorSlidersHorizontal,
  SquaresFourIcon as PhosphorSquaresFour,
  StackIcon as PhosphorStack,
  StarIcon as PhosphorStar,
  TextAlignCenterIcon as PhosphorTextAlignCenter,
  TextAlignJustifyIcon as PhosphorTextAlignJustify,
  TextAlignLeftIcon as PhosphorTextAlignLeft,
  TextAlignRightIcon as PhosphorTextAlignRight,
  TrashIcon as PhosphorTrash,
  TrayIcon as PhosphorTray,
  UploadSimpleIcon as PhosphorUploadSimple,
  UserCheckIcon as PhosphorUserCheck,
  UserGearIcon as PhosphorUserGear,
  UserMinusIcon as PhosphorUserMinus,
  UserPlusIcon as PhosphorUserPlus,
  UsersThreeIcon as PhosphorUsersThree,
  WarningIcon as PhosphorWarning,
  WarningCircleIcon as PhosphorWarningCircle,
  WrenchIcon as PhosphorWrench,
  XIcon as PhosphorX,
  XCircleIcon as PhosphorXCircle
} from "@phosphor-icons/react/ssr";

function withDefaultLight(IconComponent: Icon): Icon {
  const Wrapped = React.forwardRef<SVGSVGElement, IconProps>(
    function CowlDokIcon({ weight = "light", color = "currentColor", ...props }, ref) {
      return <IconComponent {...props} ref={ref} color={color} weight={weight} />;
    }
  );
  Wrapped.displayName = `CowlDok${IconComponent.displayName ?? "Icon"}`;
  return Wrapped;
}

export const ScanQrCode = withDefaultLight(PhosphorQrCode);
export const AlertCircle = withDefaultLight(PhosphorWarningCircle);
export const Check = withDefaultLight(PhosphorCheck);
export const Clock = withDefaultLight(PhosphorClock);
export const Download = withDefaultLight(PhosphorDownloadSimple);
export const Loader2 = withDefaultLight(PhosphorCircleNotch);
export const MinusCircle = withDefaultLight(PhosphorMinusCircle);
export const Printer = withDefaultLight(PhosphorPrinter);
export const Search = withDefaultLight(PhosphorMagnifyingGlass);
export const X = withDefaultLight(PhosphorX);
export const ArrowLeft = withDefaultLight(PhosphorArrowLeft);
export const ArrowRight = withDefaultLight(PhosphorArrowRight);
export const QrCode = withDefaultLight(PhosphorQrCode);
export const ShieldCheck = withDefaultLight(PhosphorShieldCheck);
export const Menu = withDefaultLight(PhosphorList);
export const CheckCircle2 = withDefaultLight(PhosphorCheckCircle);
export const XCircle = withDefaultLight(PhosphorXCircle);
export const RefreshCw = withDefaultLight(PhosphorArrowsClockwise);
export const AlertTriangle = withDefaultLight(PhosphorWarning);
export const CalendarClock = withDefaultLight(PhosphorCalendarDots);
export const FileBadge = withDefaultLight(PhosphorCertificate);
export const Lock = withDefaultLight(PhosphorLock);
export const ExternalLink = withDefaultLight(PhosphorArrowSquareOut);
export const LayoutDashboard = withDefaultLight(PhosphorSquaresFour);
export const LogOut = withDefaultLight(PhosphorSignOut);
export const ScrollText = withDefaultLight(PhosphorClockCounterClockwise);
export const Settings = withDefaultLight(PhosphorGearSix);
export const Upload = withDefaultLight(PhosphorUploadSimple);
export const Users = withDefaultLight(PhosphorUsersThree);
export const UserPlus = withDefaultLight(PhosphorUserPlus);
export const ClipboardList = withDefaultLight(PhosphorClipboardText);
export const Files = withDefaultLight(PhosphorFiles);
export const CalendarDots = withDefaultLight(PhosphorCalendarDots);
export const ChevronLeft = withDefaultLight(PhosphorCaretLeft);
export const ChevronRight = withDefaultLight(PhosphorCaretRight);
export const Filter = withDefaultLight(PhosphorFunnel);
export const Image = withDefaultLight(PhosphorImage);
export const Save = withDefaultLight(PhosphorFloppyDisk);
export const Eye = withDefaultLight(PhosphorEye);
export const Star = withDefaultLight(PhosphorStar);
export const Trash2 = withDefaultLight(PhosphorTrash);
export const Plus = withDefaultLight(PhosphorPlus);
export const FileText = withDefaultLight(PhosphorFileText);
export const PenLine = withDefaultLight(PhosphorPencilLine);
export const UserCog = withDefaultLight(PhosphorUserGear);
export const AlignLeft = withDefaultLight(PhosphorTextAlignLeft);
export const AlignCenter = withDefaultLight(PhosphorTextAlignCenter);
export const AlignRight = withDefaultLight(PhosphorTextAlignRight);
export const ClipboardCheck = withDefaultLight(PhosphorClipboardText);
export const CopyCheck = withDefaultLight(PhosphorChecks);
export const FileCheck2 = withDefaultLight(PhosphorFileText);
export const FileWarning = withDefaultLight(PhosphorWarningCircle);
export const RotateCcw = withDefaultLight(PhosphorArrowCounterClockwise);
export const ShieldAlert = withDefaultLight(PhosphorShieldWarning);
export const FileSpreadsheet = withDefaultLight(PhosphorFileXls);
export const GitMerge = withDefaultLight(PhosphorGitMerge);
export const UserCheck = withDefaultLight(PhosphorUserCheck);
export const UserX = withDefaultLight(PhosphorUserMinus);
export const Inbox = withDefaultLight(PhosphorTray);
export const Layers = withDefaultLight(PhosphorStack);
export const Copy = withDefaultLight(PhosphorCopy);
export const History = withDefaultLight(PhosphorClockCounterClockwise);
export const ChevronDown = withDefaultLight(PhosphorCaretDown);
export const ChevronUp = withDefaultLight(PhosphorCaretUp);
export const Pencil = withDefaultLight(PhosphorPencilSimple);
export const ChevronsUpDown = withDefaultLight(PhosphorCaretUpDown);
export const SlidersHorizontal = withDefaultLight(PhosphorSlidersHorizontal);
export const MoreVertical = withDefaultLight(PhosphorDotsThreeVertical);
export const CircleAlert = withDefaultLight(PhosphorWarningCircle);
export const FileDown = withDefaultLight(PhosphorFileArrowDown);
export const Circle = withDefaultLight(PhosphorCircle);
export const Megaphone = withDefaultLight(PhosphorMegaphone);
export const Wrench = withDefaultLight(PhosphorWrench);
export const CheckCheck = withDefaultLight(PhosphorChecks);
export const CheckSquare = withDefaultLight(PhosphorCheckSquare);
export const Archive = withDefaultLight(PhosphorArchive);
export const AlignJustify = withDefaultLight(PhosphorTextAlignJustify);
export const Mail = withDefaultLight(PhosphorEnvelope);
export const Hourglass = withDefaultLight(PhosphorHourglass);
