//! Fast offline inline calculator, unit converter, number-base converter, and color parser.

#[derive(Clone, Debug, PartialEq)]
pub enum CalculatorKind {
    Math,
    UnitConversion {
        from_unit: String,
        to_unit: String,
    },
    BaseConversion {
        decimal: String,
        hex: String,
        binary: String,
        octal: String,
    },
    ColorSwatch {
        r: u8,
        g: u8,
        b: u8,
        a: u8,
        hex: String,
        rgb: String,
        hsl: String,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct CalculatorResult {
    pub expression: String,
    pub formatted: String,
    pub copy_value: String,
    pub subtitle: String,
    pub kind: CalculatorKind,
}

/// Evaluates an inline launcher query as math, unit conversion, base conversion, or CSS color.
pub fn evaluate(query: &str) -> Option<CalculatorResult> {
    let trimmed = query.trim();
    if trimmed.is_empty() || trimmed.len() > 200 {
        return None;
    }
    if let Some(color) = parse_color(trimmed) {
        return Some(color);
    }
    if let Some(base) = parse_base_conversion(trimmed) {
        return Some(base);
    }
    if let Some(conv) = parse_unit_conversion(trimmed) {
        return Some(conv);
    }
    let expr = trimmed.strip_prefix('=').unwrap_or(trimmed).trim();
    if expr.is_empty() {
        return None;
    }
    // Require at least one operator, parenthesis, function, or leading '=' so plain filenames/numbers don't spam.
    let explicit = trimmed.starts_with('=');
    let has_op = expr.contains('+')
        || expr.contains('-')
        || expr.contains('*')
        || expr.contains('/')
        || expr.contains('^')
        || expr.contains('%')
        || expr.contains('(')
        || expr.starts_with("sqrt")
        || expr.starts_with("sin")
        || expr.starts_with("cos")
        || expr.starts_with("tan")
        || expr.starts_with("abs")
        || expr.starts_with("ln")
        || expr.starts_with("log");
    if !explicit && !has_op {
        return None;
    }
    let value = eval_math(expr)?;
    if !value.is_finite() {
        return None;
    }
    let formatted = format_number(value);
    // Avoid trivial echoes like "-5" -> "-5" unless explicit '='.
    if !explicit && formatted == expr {
        return None;
    }
    Some(CalculatorResult {
        expression: expr.to_owned(),
        copy_value: formatted.clone(),
        formatted,
        subtitle: format!("= {expr}"),
        kind: CalculatorKind::Math,
    })
}

fn format_number(v: f64) -> String {
    if v == 0.0 {
        return "0".to_owned();
    }
    if v.abs() >= 1e15 || (v.abs() > 0.0 && v.abs() < 1e-9) {
        return format!("{v:.6e}");
    }
    if (v - v.round()).abs() < 1e-10 {
        return format!("{}", v.round() as i64);
    }
    let s = format!("{v:.8}");
    s.trim_end_matches('0').trim_end_matches('.').to_owned()
}

fn parse_color(input: &str) -> Option<CalculatorResult> {
    let lower = input.to_ascii_lowercase();
    let (r, g, b, a) = if let Some(hex) = lower.strip_prefix('#') {
        match hex.len() {
            3 => {
                let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
                let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
                let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
                (r, g, b, 255)
            }
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                (r, g, b, 255)
            }
            8 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
                (r, g, b, a)
            }
            _ => return None,
        }
    } else if let Some(inner) = lower
        .strip_prefix("rgb(")
        .and_then(|s| s.strip_suffix(')'))
    {
        let parts: Vec<u8> = inner
            .split([',', ' '])
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u8>().ok())
            .collect::<Option<Vec<_>>>()?;
        if parts.len() != 3 {
            return None;
        }
        (parts[0], parts[1], parts[2], 255)
    } else {
        return None;
    };

    let hex = if a == 255 {
        format!("#{r:02X}{g:02X}{b:02X}")
    } else {
        format!("#{r:02X}{g:02X}{b:02X}{a:02X}")
    };
    let rgb = if a == 255 {
        format!("rgb({r}, {g}, {b})")
    } else {
        format!("rgba({r}, {g}, {b}, {:.2})", f32::from(a) / 255.0)
    };
    let (h, s, l) = rgb_to_hsl(r, g, b);
    let hsl = format!("hsl({h:.0}, {s:.0}%, {l:.0}%)");
    Some(CalculatorResult {
        expression: input.to_owned(),
        formatted: hex.clone(),
        copy_value: hex.clone(),
        subtitle: format!("{rgb}  ·  {hsl}"),
        kind: CalculatorKind::ColorSwatch {
            r,
            g,
            b,
            a,
            hex,
            rgb,
            hsl,
        },
    })
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rf = f64::from(r) / 255.0;
    let gf = f64::from(g) / 255.0;
    let bf = f64::from(b) / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;
    let l = (max + min) / 2.0;
    let s = if delta == 0.0 {
        0.0
    } else {
        delta / (1.0 - (2.0 * l - 1.0).abs())
    };
    let mut h = if delta == 0.0 {
        0.0
    } else if max == rf {
        60.0 * (((gf - bf) / delta) % 6.0)
    } else if max == gf {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };
    if h < 0.0 {
        h += 360.0;
    }
    (h, s * 100.0, l * 100.0)
}

fn parse_base_conversion(input: &str) -> Option<CalculatorResult> {
    let lower = input.to_ascii_lowercase();
    let (val, target): (i64, Option<&str>) = if let Some(rest) = lower.strip_prefix("0x") {
        let num = i64::from_str_radix(rest.trim(), 16).ok()?;
        (num, Some("dec"))
    } else if let Some(rest) = lower.strip_prefix("0b") {
        let num = i64::from_str_radix(rest.trim(), 2).ok()?;
        (num, Some("dec"))
    } else if let Some(rest) = lower.strip_prefix("0o") {
        let num = i64::from_str_radix(rest.trim(), 8).ok()?;
        (num, Some("dec"))
    } else if let Some((lhs, rhs)) = lower
        .split_once(" to ")
        .or_else(|| lower.split_once(" in "))
    {
        let target = rhs.trim();
        if !matches!(target, "hex" | "bin" | "binary" | "oct" | "octal" | "dec" | "decimal") {
            return None;
        }
        let lhs = lhs.trim();
        let num = if let Some(h) = lhs.strip_prefix("0x") {
            i64::from_str_radix(h, 16).ok()?
        } else if let Some(b) = lhs.strip_prefix("0b") {
            i64::from_str_radix(b, 2).ok()?
        } else {
            lhs.parse::<i64>().ok()?
        };
        (num, Some(target))
    } else {
        return None;
    };

    let decimal = val.to_string();
    let hex = format!("0x{val:X}");
    let binary = format!("0b{val:b}");
    let octal = format!("0o{val:o}");
    let formatted = match target {
        Some("hex") => hex.clone(),
        Some("bin" | "binary") => binary.clone(),
        Some("oct" | "octal") => octal.clone(),
        _ => decimal.clone(),
    };
    Some(CalculatorResult {
        expression: input.to_owned(),
        copy_value: formatted.clone(),
        formatted,
        subtitle: format!("Dec {decimal} · Hex {hex} · Bin {binary}"),
        kind: CalculatorKind::BaseConversion {
            decimal,
            hex,
            binary,
            octal,
        },
    })
}

fn parse_unit_conversion(input: &str) -> Option<CalculatorResult> {
    let lower = input.to_ascii_lowercase();
    let (lhs, rhs) = lower
        .split_once(" to ")
        .or_else(|| lower.split_once(" in "))?;
    let lhs = lhs.trim();
    let to_unit = rhs.trim();

    let split_idx = lhs
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+'))
        .unwrap_or(lhs.len());
    let num_str = lhs[..split_idx].trim();
    let from_unit = lhs[split_idx..].trim();
    if num_str.is_empty() || from_unit.is_empty() || to_unit.is_empty() {
        return None;
    }
    let value: f64 = num_str.parse().ok()?;
    let (converted, to_label) = convert_units(value, from_unit, to_unit)?;
    let formatted = format!("{} {to_label}", format_number(converted));
    Some(CalculatorResult {
        expression: input.to_owned(),
        copy_value: formatted.clone(),
        formatted,
        subtitle: format!("{value} {from_unit} → {to_label}"),
        kind: CalculatorKind::UnitConversion {
            from_unit: from_unit.to_owned(),
            to_unit: to_label.to_owned(),
        },
    })
}

fn convert_units(value: f64, from: &str, to: &str) -> Option<(f64, &'static str)> {
    // Temperature
    if let (Some(f), Some((t, label))) = (temp_unit(from), temp_unit_label(to)) {
        let celsius = match f {
            'c' => value,
            'f' => (value - 32.0) * 5.0 / 9.0,
            'k' => value - 273.15,
            _ => return None,
        };
        let out = match t {
            'c' => celsius,
            'f' => celsius * 9.0 / 5.0 + 32.0,
            'k' => celsius + 273.15,
            _ => return None,
        };
        return Some((out, label));
    }
    // Linear unit families (factor to canonical SI base)
    if let (Some((f_cat, f_mul, _)), Some((t_cat, t_mul, t_label))) =
        (linear_unit(from), linear_unit(to))
        && f_cat == t_cat
    {
        return Some((value * f_mul / t_mul, t_label));
    }
    None
}

fn temp_unit(u: &str) -> Option<char> {
    match u {
        "c" | "°c" | "celsius" => Some('c'),
        "f" | "°f" | "fahrenheit" => Some('f'),
        "k" | "kelvin" => Some('k'),
        _ => None,
    }
}

fn temp_unit_label(u: &str) -> Option<(char, &'static str)> {
    match u {
        "c" | "°c" | "celsius" => Some(('c', "°C")),
        "f" | "°f" | "fahrenheit" => Some(('f', "°F")),
        "k" | "kelvin" => Some(('k', "K")),
        _ => None,
    }
}

fn linear_unit(u: &str) -> Option<(&'static str, f64, &'static str)> {
    match u {
        // Length (base: meter)
        "mm" | "millimeter" | "millimeters" => Some(("len", 0.001, "mm")),
        "cm" | "centimeter" | "centimeters" => Some(("len", 0.01, "cm")),
        "m" | "meter" | "meters" => Some(("len", 1.0, "m")),
        "km" | "kilometer" | "kilometers" => Some(("len", 1000.0, "km")),
        "in" | "inch" | "inches" => Some(("len", 0.0254, "in")),
        "ft" | "foot" | "feet" => Some(("len", 0.3048, "ft")),
        "yd" | "yard" | "yards" => Some(("len", 0.9144, "yd")),
        "mi" | "mile" | "miles" => Some(("len", 1609.344, "mi")),
        // Mass (base: gram)
        "mg" => Some(("mass", 0.001, "mg")),
        "g" | "gram" | "grams" => Some(("mass", 1.0, "g")),
        "kg" | "kilogram" | "kilograms" => Some(("mass", 1000.0, "kg")),
        "oz" | "ounce" | "ounces" => Some(("mass", 28.349_523_125, "oz")),
        "lb" | "lbs" | "pound" | "pounds" => Some(("mass", 453.592_37, "lb")),
        // Data (base: byte, binary IEC)
        "b" | "byte" | "bytes" => Some(("data", 1.0, "B")),
        "kb" | "kib" => Some(("data", 1024.0, "KB")),
        "mb" | "mib" => Some(("data", 1024.0 * 1024.0, "MB")),
        "gb" | "gib" => Some(("data", 1024.0 * 1024.0 * 1024.0, "GB")),
        "tb" | "tib" => Some(("data", 1024.0 * 1024.0 * 1024.0 * 1024.0, "TB")),
        // Time (base: second)
        "ms" | "millisecond" | "milliseconds" => Some(("time", 0.001, "ms")),
        "s" | "sec" | "second" | "seconds" => Some(("time", 1.0, "s")),
        "min" | "minute" | "minutes" => Some(("time", 60.0, "min")),
        "h" | "hr" | "hour" | "hours" => Some(("time", 3600.0, "h")),
        "d" | "day" | "days" => Some(("time", 86400.0, "d")),
        // Pixels / typography (base: px at 16px root)
        "px" => Some(("css", 1.0, "px")),
        "rem" => Some(("css", 16.0, "rem")),
        "pt" => Some(("css", 4.0 / 3.0, "pt")),
        _ => None,
    }
}

// Recursive descent math parser: + - * / % ^ unary () and constants/functions.
struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

fn eval_math(input: &str) -> Option<f64> {
    let mut parser = Parser {
        bytes: input.as_bytes(),
        pos: 0,
    };
    let val = parser.parse_expr()?;
    parser.skip_ws();
    if parser.pos == parser.bytes.len() {
        Some(val)
    } else {
        None
    }
}

impl<'a> Parser<'a> {
    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn peek(&mut self) -> Option<u8> {
        self.skip_ws();
        self.bytes.get(self.pos).copied()
    }

    fn parse_expr(&mut self) -> Option<f64> {
        let mut lhs = self.parse_term()?;
        while let Some(op) = self.peek() {
            match op {
                b'+' => {
                    self.pos += 1;
                    lhs += self.parse_term()?;
                }
                b'-' => {
                    self.pos += 1;
                    lhs -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_term(&mut self) -> Option<f64> {
        let mut lhs = self.parse_power()?;
        while let Some(op) = self.peek() {
            match op {
                b'*' => {
                    self.pos += 1;
                    lhs *= self.parse_power()?;
                }
                b'/' => {
                    self.pos += 1;
                    let rhs = self.parse_power()?;
                    if rhs == 0.0 {
                        return None;
                    }
                    lhs /= rhs;
                }
                b'%' => {
                    self.pos += 1;
                    let rhs = self.parse_power()?;
                    if rhs == 0.0 {
                        return None;
                    }
                    lhs %= rhs;
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_power(&mut self) -> Option<f64> {
        let base = self.parse_unary()?;
        if self.peek() == Some(b'^') {
            self.pos += 1;
            let exp = self.parse_power()?;
            return Some(base.powf(exp));
        }
        Some(base)
    }

    fn parse_unary(&mut self) -> Option<f64> {
        match self.peek()? {
            b'-' => {
                self.pos += 1;
                Some(-self.parse_unary()?)
            }
            b'+' => {
                self.pos += 1;
                self.parse_unary()
            }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Option<f64> {
        self.skip_ws();
        let ch = *self.bytes.get(self.pos)?;
        if ch == b'(' {
            self.pos += 1;
            let val = self.parse_expr()?;
            if self.peek() != Some(b')') {
                return None;
            }
            self.pos += 1;
            return Some(val);
        }
        if ch.is_ascii_alphabetic() {
            let start = self.pos;
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_alphabetic() {
                self.pos += 1;
            }
            let ident = std::str::from_utf8(&self.bytes[start..self.pos])
                .ok()?
                .to_ascii_lowercase();
            return match ident.as_str() {
                "pi" => Some(std::f64::consts::PI),
                "e" => Some(std::f64::consts::E),
                "tau" => Some(std::f64::consts::TAU),
                fn_name => {
                    if self.peek() != Some(b'(') {
                        return None;
                    }
                    self.pos += 1;
                    let arg = self.parse_expr()?;
                    if self.peek() != Some(b')') {
                        return None;
                    }
                    self.pos += 1;
                    match fn_name {
                        "sqrt" => Some(arg.sqrt()),
                        "abs" => Some(arg.abs()),
                        "sin" => Some(arg.sin()),
                        "cos" => Some(arg.cos()),
                        "tan" => Some(arg.tan()),
                        "ln" => Some(arg.ln()),
                        "log" => Some(arg.log10()),
                        "floor" => Some(arg.floor()),
                        "ceil" => Some(arg.ceil()),
                        "round" => Some(arg.round()),
                        _ => None,
                    }
                }
            };
        }
        let start = self.pos;
        let mut saw_dot = false;
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            if b.is_ascii_digit() || b == b'_' {
                self.pos += 1;
            } else if b == b'.' && !saw_dot {
                saw_dot = true;
                self.pos += 1;
            } else {
                break;
            }
        }
        if self.pos == start {
            return None;
        }
        let raw = std::str::from_utf8(&self.bytes[start..self.pos])
            .ok()?
            .replace('_', "");
        raw.parse::<f64>().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluates_math_units_bases_and_colors() {
        assert_eq!(evaluate("2 + 2 * 10").unwrap().formatted, "22");
        assert_eq!(evaluate("sqrt(144) + 2^3").unwrap().formatted, "20");
        assert_eq!(evaluate("100 c to f").unwrap().formatted, "212 °F");
        assert_eq!(evaluate("2 gb to mb").unwrap().formatted, "2048 MB");
        assert_eq!(evaluate("255 to hex").unwrap().formatted, "0xFF");
        assert_eq!(evaluate("0xff").unwrap().formatted, "255");
        assert_eq!(evaluate("#6cc6ff").unwrap().formatted, "#6CC6FF");
        assert!(evaluate("report.pdf").is_none());
    }
}
