import {z} from 'zod';

export const appearanceSchema = z.object({
  mode: z.enum(['system', 'light', 'dark']).default('system'),
  transparency: z.enum(['native', 'reduced', 'disabled']).default('native'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  preview: z.enum(['automatic', 'always', 'never']).default('automatic'),
  motion: z.enum(['system', 'full', 'reduced']).default('system'),
  effects: z.enum(['full', 'reduced']).default('full'),
});

export type AppearanceSettings = z.infer<typeof appearanceSchema>;

export const defaultAppearanceSettings: AppearanceSettings = appearanceSchema.parse({});

export function parseAppearanceSettings(value: unknown): AppearanceSettings {
  const result = appearanceSchema.safeParse(value);
  return result.success ? result.data : defaultAppearanceSettings;
}

