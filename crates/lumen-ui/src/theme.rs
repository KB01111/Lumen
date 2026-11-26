//! Flagship visual design system for Lumen (obsidian translucent glass + luminous cyan accents).

use gpui_kit::{
    component::{Theme, ThemeMode},
    *,
};
use lumen_core::settings::{AppearanceSettings, ThemeModeSetting, TransparencySetting};

#[derive(Clone, Copy, Debug)]
pub struct LumenPalette {
    pub is_dark: bool,
    pub reduced_motion: bool,
    pub compact: bool,

    // Surfaces
    pub window_bg: Hsla,
    pub surface_elevated: Hsla,
    pub surface_inset: Hsla,
    pub surface_footer: Hsla,
    pub surface_popover: Hsla,
    pub row_hover: Hsla,
    pub row_selected_bg: Hsla,
    pub row_selected_border: Hsla,
    pub icon_tile_bg: Hsla,

    // Borders & specular highlights
    pub border_outer: Hsla,
    pub border_subtle: Hsla,
    pub top_beam: Hsla,

    // Text hierarchy
    pub text_primary: Hsla,
    pub text_secondary: Hsla,
    pub text_muted: Hsla,
    pub text_inverse: Hsla,

    // Brand & semantic accents
    pub accent: Hsla,
    pub accent_bright: Hsla,
    pub accent_soft: Hsla,
    pub accent_border: Hsla,
    pub success: Hsla,
    pub warning: Hsla,
    pub danger: Hsla,

    // Kind tint accents for crisp icon tiles
    pub kind_app: Hsla,
    pub kind_folder: Hsla,
    pub kind_code: Hsla,
    pub kind_doc: Hsla,
    pub kind_image: Hsla,
    pub kind_calc: Hsla,
    pub kind_command: Hsla,
    pub kind_clipboard: Hsla,
    pub kind_help: Hsla,

    // Keycap badge
    pub kbd_bg: Hsla,
    pub kbd_border: Hsla,
    pub kbd_text: Hsla,
}

impl LumenPalette {
    pub fn resolve(
        appearance: &AppearanceSettings,
        glass_intensity: u8,
        window_appearance: WindowAppearance,
    ) -> Self {
        let is_dark = match appearance.mode {
            ThemeModeSetting::Dark => true,
            ThemeModeSetting::Light => false,
            ThemeModeSetting::System => matches!(
                window_appearance,
                WindowAppearance::Dark | WindowAppearance::VibrantDark
            ),
        };
        let translucent = appearance.transparency != TransparencySetting::Disabled;
        let reduced_motion = appearance.motion == lumen_core::settings::MotionSetting::Reduced;
        let compact = appearance.density == lumen_core::settings::DensitySetting::Compact;

        // Higher glass_intensity = more translucent glass; lower = denser tint for legibility.
        let glass_factor = (f32::from(glass_intensity.clamp(20, 100)) / 100.0).clamp(0.2, 1.0);
        let dark_alpha = if !translucent {
            1.0
        } else if appearance.transparency == TransparencySetting::Reduced {
            0.94
        } else {
            0.92 - 0.14 * glass_factor
        };
        let light_alpha = if !translucent {
            1.0
        } else if appearance.transparency == TransparencySetting::Reduced {
            0.95
        } else {
            0.93 - 0.12 * glass_factor
        };

        if is_dark {
            Self {
                is_dark: true,
                reduced_motion,
                compact,
                // Deep obsidian / midnight translucent base
                window_bg: rgba_hsla(10, 14, 21, dark_alpha),
                surface_elevated: rgba_hsla(19, 27, 38, if translucent { 0.88 } else { 1.0 }),
                surface_inset: rgba_hsla(6, 9, 15, if translucent { 0.54 } else { 1.0 }),
                surface_footer: rgba_hsla(7, 11, 17, if translucent { 0.72 } else { 1.0 }),
                surface_popover: rgba_hsla(14, 20, 30, 0.96),
                row_hover: rgba_hsla(210, 232, 255, 0.055),
                row_selected_bg: rgba_hsla(108, 198, 255, 0.135),
                row_selected_border: rgba_hsla(108, 198, 255, 0.28),
                icon_tile_bg: rgba_hsla(210, 232, 255, 0.055),

                border_outer: rgba_hsla(255, 255, 255, 0.11),
                border_subtle: rgba_hsla(200, 226, 255, 0.075),
                top_beam: rgba_hsla(138, 212, 255, 0.52),

                text_primary: rgba_hsla(240, 247, 255, 0.96),
                text_secondary: rgba_hsla(194, 213, 234, 0.76),
                text_muted: rgba_hsla(160, 184, 210, 0.56),
                text_inverse: rgba_hsla(4, 18, 29, 1.0),

                accent: rgba_hsla(108, 198, 255, 1.0),
                accent_bright: rgba_hsla(143, 211, 255, 1.0),
                accent_soft: rgba_hsla(108, 198, 255, 0.14),
                accent_border: rgba_hsla(108, 198, 255, 0.34),
                success: rgba_hsla(123, 224, 176, 1.0),
                warning: rgba_hsla(242, 202, 125, 1.0),
                danger: rgba_hsla(255, 146, 146, 1.0),

                kind_app: rgba_hsla(108, 198, 255, 1.0),
                kind_folder: rgba_hsla(246, 193, 119, 1.0),
                kind_code: rgba_hsla(114, 224, 210, 1.0),
                kind_doc: rgba_hsla(242, 139, 168, 1.0),
                kind_image: rgba_hsla(196, 167, 231, 1.0),
                kind_calc: rgba_hsla(123, 224, 176, 1.0),
                kind_command: rgba_hsla(137, 180, 250, 1.0),
                kind_clipboard: rgba_hsla(180, 190, 254, 1.0),
                kind_help: rgba_hsla(148, 226, 213, 1.0),

                kbd_bg: rgba_hsla(255, 255, 255, 0.065),
                kbd_border: rgba_hsla(255, 255, 255, 0.11),
                kbd_text: rgba_hsla(210, 228, 248, 0.78),
            }
        } else {
            Self {
                is_dark: false,
                reduced_motion,
                compact,
                window_bg: rgba_hsla(247, 250, 253, light_alpha),
                surface_elevated: rgba_hsla(255, 255, 255, if translucent { 0.94 } else { 1.0 }),
                surface_inset: rgba_hsla(227, 234, 242, if translucent { 0.56 } else { 1.0 }),
                surface_footer: rgba_hsla(236, 241, 247, if translucent { 0.76 } else { 1.0 }),
                surface_popover: rgba_hsla(252, 254, 255, 0.98),
                row_hover: rgba_hsla(12, 36, 62, 0.05),
                row_selected_bg: rgba_hsla(10, 111, 189, 0.11),
                row_selected_border: rgba_hsla(10, 111, 189, 0.25),
                icon_tile_bg: rgba_hsla(14, 40, 68, 0.055),

                border_outer: rgba_hsla(16, 42, 68, 0.14),
                border_subtle: rgba_hsla(16, 42, 68, 0.085),
                top_beam: rgba_hsla(47, 155, 230, 0.55),

                text_primary: rgba_hsla(11, 23, 36, 0.94),
                text_secondary: rgba_hsla(31, 50, 70, 0.76),
                text_muted: rgba_hsla(48, 69, 92, 0.62),
                text_inverse: rgba_hsla(248, 252, 255, 1.0),

                accent: rgba_hsla(10, 111, 189, 1.0),
                accent_bright: rgba_hsla(32, 138, 218, 1.0),
                accent_soft: rgba_hsla(10, 111, 189, 0.11),
                accent_border: rgba_hsla(10, 111, 189, 0.30),
                success: rgba_hsla(17, 119, 76, 1.0),
                warning: rgba_hsla(154, 102, 12, 1.0),
                danger: rgba_hsla(189, 52, 52, 1.0),

                kind_app: rgba_hsla(10, 111, 189, 1.0),
                kind_folder: rgba_hsla(186, 117, 18, 1.0),
                kind_code: rgba_hsla(13, 132, 120, 1.0),
                kind_doc: rgba_hsla(182, 52, 86, 1.0),
                kind_image: rgba_hsla(122, 68, 188, 1.0),
                kind_calc: rgba_hsla(17, 128, 82, 1.0),
                kind_command: rgba_hsla(36, 98, 204, 1.0),
                kind_clipboard: rgba_hsla(84, 76, 198, 1.0),
                kind_help: rgba_hsla(16, 126, 132, 1.0),

                kbd_bg: rgba_hsla(16, 42, 68, 0.06),
                kbd_border: rgba_hsla(16, 42, 68, 0.13),
                kbd_text: rgba_hsla(31, 50, 70, 0.78),
            }
        }
    }

    pub fn row_height(&self) -> f32 {
        if self.compact { 44.0 } else { 54.0 }
    }

    pub fn section_height(&self) -> f32 {
        26.0
    }
}

/// Synchronizes `gpui-component`'s global Theme (used by `Input`, scrollbars, overlays) with Lumen's palette.
pub fn sync_kit_theme(palette: &LumenPalette, window: Option<&mut Window>, cx: &mut App) {
    let mode = if palette.is_dark {
        ThemeMode::Dark
    } else {
        ThemeMode::Light
    };
    Theme::change(mode, window, cx);
    let theme = Theme::global_mut(cx);
    theme.font_family = "Segoe UI Variable Text".into();
    theme.mono_font_family = "Cascadia Code".into();
    theme.colors.foreground = palette.text_primary;
    theme.colors.muted_foreground = palette.text_muted;
    theme.colors.caret = palette.accent;
    theme.colors.selection = palette.accent_soft;
    theme.colors.ring = palette.accent_border;
    theme.colors.accent = palette.accent;
    theme.colors.primary = palette.accent;
    theme.colors.primary_foreground = palette.text_inverse;
    theme.colors.border = palette.border_subtle;
    theme.colors.popover = palette.surface_popover;
    theme.colors.popover_foreground = palette.text_primary;
    theme.colors.background = palette.window_bg;
}

pub fn rgba_hsla(r: u8, g: u8, b: u8, a: f32) -> Hsla {
    let rgba = Rgba {
        r: f32::from(r) / 255.0,
        g: f32::from(g) / 255.0,
        b: f32::from(b) / 255.0,
        a: a.clamp(0.0, 1.0),
    };
    rgba.into()
}
