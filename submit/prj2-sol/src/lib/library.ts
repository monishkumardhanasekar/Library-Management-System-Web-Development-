import { Errors } from 'cs544-js-utils';
import { zodToResult } from './zod-utils.js';

import { z } from 'zod';

const GUTENBERG_YEAR = 1448;
const NOW_YEAR = new Date().getFullYear();

//specify key in zod validator to get value as message after
//passing through zodToResult()
const MSGS = {
  'msg.isbn':  'isbn must be of the form "ddd-ddd-ddd-d"',
  'msg.nonEmpty': 'must be non-empty',
  'msg.oneOrMoreAuthors': 'must have one or more authors',
  'msg.publishYear': `must be a past year on or after ${GUTENBERG_YEAR}`,
};

// Define schema for Book object using Zod to ensure data integrity:
//   isbn: must be a valid ISBN-10 string in the format ddd-ddd-ddd-d.
//   title: must be a non-empty string.
//   authors: must be a non-empty array containing non-empty strings.
//   pages: must be a positive integer.
//   year: must be an integer within the range [GUTENBERG_YEAR, NOW_YEAR].
//   publisher: must be a non-empty string.
//   nCopies: (optional) must be a positive integer.
const Book = z.object({
  isbn: z.string().regex(/^(?:\d{3}-){3}\d{1}$/, { message: "ISBN must be in the format ddd-ddd-ddd-d" }),
  title: z.string().min(1, { message: "Title must be a non-empty string" }),
  authors: z.array(z.string().min(1)).min(1, { message: "Authors must be a non-empty array of non-empty strings" }),
  pages: z.number().int().positive({ message: "Pages must be a positive integer" }),
  year: z.number().int().min(GUTENBERG_YEAR).max(NOW_YEAR, { message: "Year must be an integer within the range [" + GUTENBERG_YEAR + ", " + NOW_YEAR + "]" }),
  publisher: z.string().min(1, { message: "Publisher must be a non-empty string" }),
  nCopies: z.number().int().positive().optional(),
});



export type Book = z.infer<typeof Book>;

const XBook = Book.required();
export type XBook = z.infer<typeof XBook>;

// use zod to force Find to have the following fields:
//   search: a string which contains at least one word of two-or-more \w.
//   index: an optional non-negative integer.
//   count: an optional non-negative integer.
const Find = z.object({
  search: z.string()
      .regex(/\b\w{2,}\b/, { message: "Search field must contain at least one word with length > 1" })
      .min(1, { message: "Search field must not be empty" }),

  index: z.number().int().min(0).optional(), //index: an optional non-negative integer.
  count: z.number().int().min(0).optional(), //count: an optional non-negative integer.
});



export type Find = z.infer<typeof Find>;

// use zod to force Lend to have the following fields:
//   isbn: a ISBN-10 string of the form ddd-ddd-ddd-d.
//   patronId: a non-empty string.
const Lend = z.object({
  // Enforce ISBN field to be in the format ddd-ddd-ddd-d
  isbn: z.string().regex(/^(?:\d{3}-){3}\d{1}$/, { message: "ISBN must be in the format ddd-ddd-ddd-d" }),

  // Ensure patronId field is a non-empty string
  patronId: z.string().min(1).refine(value => value.trim().length > 0, { message: "Patron ID must be a non-empty string" }),
});




export type Lend = z.infer<typeof Lend>;

const VALIDATORS: Record<string, z.ZodSchema> = {
  addBook: Book,
  findBooks: Find,
  checkoutBook: Lend,
  returnBook: Lend,
};

export function validate<T>(command: string, req: Record<string, any>)
  : Errors.Result<T> 
{
  const validator = VALIDATORS[command];
  return (validator)
    ? zodToResult(validator.safeParse(req), MSGS)
    : Errors.errResult(`no validator for command ${command}`);
}

