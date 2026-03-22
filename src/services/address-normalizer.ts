/**
 * AddressNormalizer - Normalize and parse address strings
 */

export interface ParsedAddress {
  street: string;
  number?: number;
  unit?: string; // e.g., "Apto 1", "Local 2", etc.
  province?: string;
  department?: string;
  municipality?: string;
  locality?: string;
}

export interface ParsedStreet {
  name?: string;
  street?: string;
  prefix?: string; // e.g., "Avenida", "Calle", etc.
}

export interface ParsedNumber {
  value: number;
  suffix?: string; // e.g., "bis", "quarter"
}

export interface ParsedUnit {
  type?: string; // "Apto", "Local", "Casa", etc.
  number?: string; // "1", "A", etc.
  floor?: number;
}

/**
 * Normalizes and parses Argentine addresses, streets, and numbers
 */
export class AddressNormalizer {
  /**
   * Normalize an address string into components
   */
  normalize(addressString: string): ParsedAddress {
    // Remove extra whitespace
    const cleaned = addressString.trim().replace(/\s+/g, " ");

    // Split by common separators
    const parts = cleaned.split(",").map((p) => p.trim());

    const result: ParsedAddress = {
      street: "",
    };

    // First part is typically the street (may include number)
    if (parts.length > 0) {
      const streetAndNumber = this.parseStreet(parts[0]);
      result.street = streetAndNumber.name || streetAndNumber.street || "";
      if (streetAndNumber.prefix) {
        result.street = `${streetAndNumber.prefix} ${result.street}`;
      }
    }

    // Check if parts[1] is a pure number (address format: street, number, city)
    if (parts.length > 1) {
      const secondPart = parts[1].trim();
      const numMatch = secondPart.match(/^\d+$/);
      if (numMatch) {
        result.number = parseInt(secondPart, 10);
      }
    }

    // If no number found in parts[1], try to extract from parts[0]
    if (!result.number && parts.length > 0) {
      for (let i = 0; i < parts[0].length; i++) {
        const char = parts[0].charAt(i);
        if (/\d/.test(char)) {
          // Found start of number
          let numStr = "";
          while (
            i < parts[0].length &&
            (/\d/.test(parts[0].charAt(i)) || parts[0].charAt(i) === ".")
          ) {
            numStr += parts[0].charAt(i);
            i++;
          }
          result.number = parseInt(numStr.replace(".", ""), 10);
          break;
        }
      }
    }

    // Subsequent parts: province, department, municipality, locality
    // Determine start index based on whether parts[1] was used for number
    let startIndex = 1;
    if (parts.length > 1) {
      const secondPart = parts[1].trim();
      if (secondPart.match(/^\d+$/)) {
        startIndex = 2; // We used parts[1] for number, so start from parts[2] for city
      }
    }

    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i];
      // Determine what this part represents based on its position
      const partRole = i - startIndex + 1; // 1 = province, 2 = department, 3 = municipality, 4 = locality
      if (partRole === 1) result.province = part;
      else if (partRole === 2) result.department = part;
      else if (partRole === 3) result.municipality = part;
      else if (partRole === 4) result.locality = part;
    }

    return result;
  }

  /**
   * Parse a street name, extracting prefix and name
   */
  parseStreet(streetString: string): ParsedStreet {
    const cleaned = streetString.trim().toLowerCase();

    // Common street prefixes in Argentina
    const prefixes = [
      "avenida",
      "avenida general",
      "avenida almirante",
      "avenida paseo",
      "av",
      "calle",
      "ca",
      "pasaje",
      "paseo",
      "camino",
      "ruta",
      "via",
      "v",
      "bulevar",
      "boulevard",
      "diagonal",
      "circunvalacion",
      "circunvalación",
    ];

    let prefix = "";
    let name = streetString;

    // Remove dots to normalize abbreviations like "Av." -> "Av"
    const cleanedNoDots = cleaned.replace(/\./g, "");
    
    for (const p of prefixes) {
      if (cleanedNoDots.startsWith(p)) {
        prefix = p;
        // Extract name after prefix, removing dots
        const afterPrefix = streetString.substring(p.length);
        // Also remove the dot if it follows the prefix
        name = afterPrefix.replace(/^\.?\s*/, "").trim();
        break;
      }
    }

    // Capitalize properly
    const capitalizedName = this.capitalize(name);
    const capitalizedPrefix =
      prefix.length > 0 ? this.capitalize(prefix) : undefined;

    return {
      name: capitalizedName,
      street: capitalizedName,
      prefix: capitalizedPrefix,
    };
  }

  /**
   * Parse a street number, handling suffixes like "bis", "quarter"
   */
  parseNumber(numberString: string | number): ParsedNumber {
    const str = String(numberString).toUpperCase();

    // Extract numeric part
    const match = str.match(/^\d+/);
    if (!match) {
      throw new Error(`Invalid number format: ${numberString}`);
    }

    const value = parseInt(match[0], 10);
    const suffix = str.substring(match[0].length).trim() || undefined;

    return {
      value,
      suffix,
    };
  }

  /**
   * Parse a unit/apartment notation, e.g., "Apto 1", "Local 2", "Casa A"
   */
  parseUnit(unitString: string): ParsedUnit {
    const cleaned = unitString.trim();
    const match = cleaned.match(/^([a-zA-Z]+)\s+([\dA-Za-z]+)(?:,?\s*(\d+))?$/i);

    if (!match) {
      return {} as ParsedUnit;
    }

    return {
      type: match[1],
      number: match[2],
      floor: match[3] ? parseInt(match[3], 10) : undefined,
    };
  }

  /**
   * Capitalize first letter of each word
   */
  private capitalize(str: string): string {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  /**
   * Normalize street name by removing accents and standardizing format
   */
  normalizeStreetName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .normalize("NFD") // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/\s+/g, " ");
  }

  /**
   * Validate an address has required components
   */
  isValid(address: ParsedAddress): boolean {
    return !!address.street && address.street.length > 0 && !!address.number;
  }
}
