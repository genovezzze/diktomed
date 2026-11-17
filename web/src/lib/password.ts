import { randomInt } from "node:crypto";

// Temporary passwords an administrator reads out or hands over: no look-alike
// characters (0/O, 1/l/I), grouped for reading, 15 random characters.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function temporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let part = "";
    for (let i = 0; i < 5; i++) part += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(part);
  }
  return groups.join("-");
}

/** At least 12 characters, with a letter and a digit. Returns an error in Latvian or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Parolei jābūt vismaz 12 rakstzīmes garai.";
  if (password.length > 200) return "Parole ir pārāk gara.";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Parolē jābūt gan burtiem, gan cipariem.";
  return null;
}
