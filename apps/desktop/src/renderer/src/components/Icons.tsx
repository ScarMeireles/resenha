import type { ReactNode, SVGProps } from 'react'

/** Ícones de traço, iguais aos dos mockups. Decorativos: quem usa põe o aria-label no botão. */
function Icon({ size = 18, children, ...props }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

type P = { size?: number }

export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const CameraIcon = (p: P) => (
  <Icon {...p}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></Icon>
)
export const ScreenShareIcon = (p: P) => (
  <Icon {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>
)
export const VideoIcon = (p: P) => (
  <Icon {...p}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></Icon>
)
export const VideoOffIcon = (p: P) => (
  <Icon {...p}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /><path d="M1 1l22 22" /></Icon>
)
export const CheckIcon = (p: P) => <Icon {...p} strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></Icon>
export const EyeIcon = (p: P) => (
  <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
)
export const EyeOffIcon = (p: P) => (
  <Icon {...p}><path d="M17.9 17.9A10.1 10.1 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.2 3.2M14.1 14.1a3 3 0 11-4.2-4.2M1 1l22 22" /></Icon>
)
export const MicIcon = (p: P) => (
  <Icon {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3" /></Icon>
)
export const HeadphonesIcon = (p: P) => (
  <Icon {...p}><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1v-6h3zM3 19a2 2 0 002 2h1v-6H3z" /></Icon>
)
export const SettingsIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Icon>
)
export const UsersIcon = (p: P) => (
  <Icon {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /></Icon>
)
export const UserPlusIcon = (p: P) => (
  <Icon {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" /></Icon>
)
export const LogOutIcon = (p: P) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Icon>
)
export const XIcon = (p: P) => <Icon {...p} strokeWidth={2.4}><path d="M18 6L6 18M6 6l12 12" /></Icon>
export const ChatIcon = (p: P) => <Icon {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></Icon>
export const PhoneIcon = (p: P) => (
  <Icon {...p}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" /></Icon>
)
export const HashIcon = (p: P) => <Icon {...p}><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></Icon>
export const ChevronDownIcon = (p: P) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
export const SendIcon = (p: P) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></Icon>
export const TrashIcon = (p: P) => (
  <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" /></Icon>
)
export const EditIcon = (p: P) => (
  <Icon {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Icon>
)
export const SpeakerIcon = (p: P) => (
  <Icon {...p}><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" /></Icon>
)
export const MicOffIcon = (p: P) => (
  <Icon {...p}><path d="M1 1l22 22M9 9v3a3 3 0 005.1 2.1M15 9.3V5a3 3 0 00-5.9-.7M17 16.9A7 7 0 015 12v-2M19 10v2c0 .8-.1 1.5-.4 2.2M12 19v3" /></Icon>
)
export const HeadphonesOffIcon = (p: P) => (
  <Icon {...p}><path d="M3 18v-6a9 9 0 013.5-7.1M21 18v-6a9 9 0 00-9-9c-.8 0-1.6.1-2.3.3M21 19a2 2 0 01-2 2h-1v-6h3zM3 19a2 2 0 002 2h1v-6H3zM1 1l22 22" /></Icon>
)
export const PhoneOffIcon = (p: P) => (
  <Icon {...p}><path d="M10.7 13.3a16 16 0 002.9 2.2l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.4 19.4 0 01-3.3-2.6M6.1 9.7A19.8 19.8 0 013.1 4.2 2 2 0 015.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L9.1 9.9M1 1l22 22" /></Icon>
)
export const VolumeMuteIcon = (p: P) => <Icon {...p}><path d="M11 5L6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" /></Icon>
export const ChevronUpIcon = (p: P) => <Icon {...p}><path d="M6 15l6-6 6 6" /></Icon>
export const SwapIcon = (p: P) => (
  <Icon {...p}><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" /></Icon>
)
export const StopIcon = (p: P) => <Icon {...p}><rect x="5" y="5" width="14" height="14" rx="2" /></Icon>
export const FullscreenIcon = (p: P) => (
  <Icon {...p}><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></Icon>
)
export const FullscreenExitIcon = (p: P) => (
  <Icon {...p}><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" /></Icon>
)
export const PopoutIcon = (p: P) => (
  <Icon {...p}><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /></Icon>
)
export const PopinIcon = (p: P) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="12" y="12" width="6" height="5" rx="1" fill="currentColor" /></Icon>
)
export const PinIcon = (p: P) => <Icon {...p}><path d="M12 17v5M9 3h6l-1 7 4 4H6l4-4z" /></Icon>
