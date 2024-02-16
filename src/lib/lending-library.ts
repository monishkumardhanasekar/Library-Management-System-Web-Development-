import { Errors } from "cs544-js-utils";

/** Note that errors are documented using the `code` option which must be
 *  returned (the `message` can be any suitable string which describes
 *  the error as specifically as possible).  Whenever possible, the
 *  error should also contain a `widget` option specifying the widget
 *  responsible for the error).
 *
 *  Note also that none of the function implementations should normally
 *  require a sequential scan over all books or patrons.
 */

/******************** Types for Validated Requests *********************/

/** used as an ID for a book */
type ISBN = string;

/** used as an ID for a library patron */
type PatronId = string;

export type Book = {
  isbn: ISBN;
  title: string;
  authors: string[];
  pages: number;
  year: number;
  publisher: string;
  nCopies?: number; //# of copies owned by library; not affected by borrows;
  //defaults to 1
};

export type XBook = Required<Book>;

type AddBookReq = Book;
type FindBooksReq = { search: string };
type ReturnBookReq = { patronId: PatronId; isbn: ISBN };
type CheckoutBookReq = { patronId: PatronId; isbn: ISBN };

/************************ Main Implementation **************************/

export function makeLendingLibrary() {
  return new LendingLibrary();
}

export class LendingLibrary {
  //TODO: declare private TS properties for instance
  private booksIndex: Record<ISBN, XBook>;
  private patronBooks: Record<PatronId, ISBN[]>;
  private checkBooks: Record<ISBN, PatronId[]>;
  private wordIndex: Record<string, ISBN[]>;

  constructor() {
    //TODO: initialize private TS properties for instance
    this.booksIndex = {};
    this.patronBooks = {};
    this.checkBooks = {};
    this.wordIndex = {};
  }

  /** Add one-or-more copies of book represented by req to this library.
   *
   *  Errors:
   *    MISSING: one-or-more of the required fields is missing.
   *    BAD_TYPE: one-or-more fields have the incorrect type.
   *    BAD_REQ: nCopies not a positive integer or book is already in
   *             library but data in obj is inconsistent with the data
   *             already present.
   *    BAD_REQ: other issues like nCopies not a positive integer
   *             or book is already in library but data in obj is
   *             inconsistent with the data already present.
   */
  addBook(req: Record<string, any> | AddBookReq): Errors.Result<XBook> {
    const ncopies = req.nCopies || 1;

    // Validate the required properties of the request
    const requiredValidation = checkRequiredProps(req, RequiredType.Book);
    if (!requiredValidation.isOk) return requiredValidation;

    // Validate the types of properties in the request
    const typeValidation = checkPropsType(req, RequiredType.Book);
    if (!typeValidation.isOk) return typeValidation;

    // Check for any bad requests based on specified conditions
    const badRequestValidation = checkBadReq(req, RequiredType.Book);
    if (!badRequestValidation.isOk) return badRequestValidation;

    const existingBook = this.booksIndex[req.isbn];

    // Check if the book already exists
    if (existingBook) {
      // Validate for inconsistencies
      const inconsistencyResult = checkInconsistentProps(req, existingBook, RequiredType.Book);
      if (!inconsistencyResult.isOk) {
        return inconsistencyResult;
      }
      
      // Update the number of copies for the existing book
      existingBook.nCopies += ncopies;
    } else {
      const words = [
        ...extractWords(req.title),
        ...req.authors.flatMap((author: string) => extractWords(author)),
      ];

      let i = 0;
      while (i < words.length) {
        const word = words[i];
        this.wordIndex[word] = this.wordIndex[word] || [];
        this.wordIndex[word].push(req.isbn);
        i++;
      }

      const book: XBook = {
        isbn: req.isbn,
        title: req.title,
        authors: req.authors,
        pages: req.pages,
        year: req.year,
        publisher: req.publisher,
        nCopies: ncopies,
      };

      this.booksIndex[req.isbn] = book;
    }

    return Errors.okResult(this.booksIndex[req.isbn]);
  }

  /** Return all books matching (case-insensitive) all "words" in
   *  req.search, where a "word" is a max sequence of /\w/ of length > 1.
   *  Returned books should be sorted in ascending order by title.
   *
   *  Errors:
   *    MISSING: search field is missing
   *    BAD_TYPE: search field is not a string.
   *    BAD_REQ: no words in search
   */
  findBooks(req: FindBooksReq): Errors.Result<XBook[]> {
    // Check for required properties in the request
    const requiredPropsError = checkRequiredProps<FindBooksReq>(
      req,
      RequiredType.FindBook
    );
    if (!requiredPropsError.isOk) return requiredPropsError;

    // Check for correct types of properties in the request
    const propsTypeError = checkPropsType<FindBooksReq>(req, RequiredType.FindBook);
    if (!propsTypeError.isOk) return propsTypeError;

    // Check for any bad request issues
    const badRequestError = checkBadReq<FindBooksReq>(req, RequiredType.FindBook);
    if (!badRequestError.isOk) return badRequestError;

     // Extract words from the search query
    const words = extractWords(req.search);
    if (words.length === 0 || !words.some((val) => val.length > 1)) {
      return Errors.errResult(`Empty search Query`, {
        widget: "search",
        code: "BAD_REQ",
      });
    }

    let matchingISBNs: Set<ISBN> = new Set();

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordISBNs = new Set(this.wordIndex[word] || []);
  
      matchingISBNs = intersectionSet<ISBN>(matchingISBNs, wordISBNs);
  }
  
  // Retrieve books corresponding to the matching ISBNs
  const matchingBooks = [];
  for (const isbn of matchingISBNs) {
      matchingBooks.push(this.booksIndex[isbn]);
  }
  
  // Custom sorting logic based on book titles
  matchingBooks.sort((a, b) => {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      return titleA.localeCompare(titleB);
  });

    return Errors.okResult(matchingBooks);
  }

  /** Set up patron req.patronId to check out book req.isbn.
   *
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ error on business rule violation.
   */

  checkoutBook(req: CheckoutBookReq): Errors.Result<void> {
    const requiredPropsError = checkRequiredProps<CheckoutBookReq>(
      req,
      RequiredType.CheckBook
    );
    if (!requiredPropsError.isOk) return requiredPropsError;

    const propsTypeError = checkPropsType<CheckoutBookReq>(
      req,
      RequiredType.CheckBook
    );
    if (!propsTypeError.isOk) return propsTypeError;

    // Retrieve the book corresponding to the given ISBN
    const book = this.booksIndex[req.isbn];
    // If the book does not exist Return error result indicating unknown book
    if (!book) {
      return Errors.errResult(`unknown book ${req.isbn}`, {
        widget: "isbn",
        code: "BAD_REQ",
      });
    }

    this.checkBooks[req.isbn] = this.checkBooks[req.isbn] || [];
    this.patronBooks[req.patronId] = this.patronBooks[req.patronId] || [];

    // Define conditions for error cases
    const conditions = [
      {
          condition: this.checkBooks[req.isbn].length >= book.nCopies,
          message: `There are no available copies of the book with ISBN ${book.isbn} for checkout.`,
      },
      {
          condition: this.patronBooks[req.patronId].includes(req.isbn),
          message: `The book with ISBN ${req.isbn} has already been checked out by patron ${req.patronId}.`,
      },
  ];

  for (const { condition, message } of conditions) {
      if (condition) {
          return Errors.errResult(message, {
              widget: "isbn",
              code: "BAD_REQ",
          });
      }
  }

  // Record the book as checked out by the patron
  this.patronBooks[req.patronId].push(req.isbn);
  this.checkBooks[req.isbn].push(req.patronId);

  return Errors.VOID_RESULT;
  }

  /** Set up patron req.patronId to returns book req.isbn.
   *
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ error on business rule violation.
   */
  returnBook(req: ReturnBookReq): Errors.Result<void> {
    const requiredPropsError = checkRequiredProps<ReturnBookReq>(
      req,
      RequiredType.CheckBook
    );
    if (!requiredPropsError.isOk) return requiredPropsError;

    const propsTypeError = checkPropsType<ReturnBookReq>(req, RequiredType.CheckBook);
    if (!propsTypeError.isOk) return propsTypeError;

    const book = this.booksIndex[req.isbn];
    if (!book) {
      return Errors.errResult(`unknown book ${req.isbn}`, {
          widget: "isbn",
          code: "BAD_REQ",
      });
    }

    if (!this.patronBooks[req.patronId]) {
      return Errors.errResult(`Patron ${req.patronId} does not exist`, {
          widget: "patronId",
          code: "BAD_REQ",
      });
    }

    let bookFound = false;
    for (const bookId of this.patronBooks[req.patronId]) {
      if (bookId === req.isbn) {
          bookFound = true;
          break;
      }
    }


    // If the book is not checked out by the patron Return error result indicating book not checked out by the patron
    if (!bookFound) {
      return Errors.errResult(
        `No checkout of book ${req.isbn} by patron ${req.patronId}`,
        {
            widget: "isbn",
            code: "BAD_REQ",
        }
      );
    }

     // Find index of the book in the patron's checked-out books list
    const indexToBook = this.patronBooks[req.patronId].indexOf(req.isbn);
    // Find index of the patron in the book's list of checked-out patrons
    const indexToBookISBN = this.checkBooks[req.isbn].indexOf(req.patronId);

    this.patronBooks[req.patronId].splice(indexToBook, 1);

     // If the patron is found in the book's list of checked-out patrons remove the patron from the book's list of checked-out patrons
    if (indexToBookISBN !== -1) {
      this.checkBooks[req.isbn].splice(indexToBookISBN, 1);
    }

    return Errors.VOID_RESULT;
  }
}

/********************** Domain Utility Functions ***********************/

//TODO: add domain-specific utility functions or classes.

const ERROR_CODE: Record<"MISSING" | "BAD_TYPE" | "BAD_REQ", string> = {
  MISSING: "MISSING",
  BAD_TYPE: "BAD_TYPE",
  BAD_REQ: "BAD_REQ",
};

export type RequiredConfig = Record<
  string,
  {
    type: string;
    required: boolean;
    typePlaceHolder?: string;
    conditions?: Array<{
      cond: (val: any) => boolean;
      msg: string;
    }>;
  }
>;
export type RequiredConfigType = Record<
  "Book" | "CheckBook" | "FindBook",
  RequiredConfig
>;

export const RequiredType: RequiredConfigType = {
  Book: {
    isbn: { type: "string", required: true },
    title: { type: "string", required: true },
    authors: { type: "array", required: true, typePlaceHolder: "string[]" },
    pages: {
      type: "number",
      required: true,
      conditions: [
        {
          cond: (val) => val <= 0,
          msg: "nNumber of pages should be greater than 0",
        },
        {
          cond: (val) => !Number.isInteger(val),
          msg: "nNumber of pages should be greater than 0",
        },
      ],
    },
    year: {
      type: "number",
      required: true,
      conditions: [
        {
          cond: (val) => val <= 0,
          msg: "nYear must be greater than 0",
        },
        {
          cond: (val) => !Number.isInteger(val),
          msg: "nYear must be integer value",
        },
      ],
    },
    publisher: { type: "string", required: true },
    nCopies: {
      type: "number",
      required: false,
      conditions: [
        {
          cond: (val) => val <= 0,
          msg: "nNumber of copies should be greater than 0",
        },
        {
          cond: (val) => !Number.isInteger(val),
          msg: "nNumber of copies should be an integer value",
        },
      ],
    },
  },
  CheckBook: {
    isbn: { type: "string", required: true },
    patronId: { type: "string", required: true },
  },
  FindBook: {
    search: {
      type: "string",
      required: true,
      conditions: [
        {
          cond: (val) => val.trim() === "", 
          msg: "Search property is required and cannot be empty or contain special characters",
        },
      ],
    },
  },
};

export function checkEqual(
  value: string | string[],
  compValue: string | string[]
): boolean {
  if (Array.isArray(value) && Array.isArray(compValue)) {
    if (value.length !== compValue.length) {
      return true;
    }

    for (const [index, item] of value.entries()) {
      if (item !== compValue[index]) {
        return true;
      }
    }
    return false;
  } else {
    // Using strict equality check
    return value !== compValue;
  }
}

export function checkInconsistentProps<T extends Record<string, any>>(
  objectToCheck: T,
  comparisonObject: T,
  requiredType: RequiredConfig
): Errors.Result<T> {
  const requiredProperties = Object.keys(requiredType).filter(
    (key) => requiredType[key].required
  );

  const validationErrors: Errors.Err[] = [];

  for (const prop of requiredProperties) {
    if (checkEqual(objectToCheck[prop], comparisonObject[prop])) {
      validationErrors.push(
        new Errors.Err(`Inconsistent data for property '${prop}' in book '${objectToCheck.isbn}'`, {
          widget: prop,
          code: "BAD_REQ",
        })
      );
    }
  }

  return validationErrors.length > 0
    ? new Errors.ErrResult(validationErrors)
    : Errors.okResult(objectToCheck);
}

/********************* General Utility Functions ***********************/

//TODO: add general utility functions or classes.

function intersectionSet<T>(A: Set<T>, B: Set<T>): Set<T> {
  if (A.size) {
    return new Set([...A].filter((x) => B.has(x)));
  }
  return new Set([...B]);
}


export function getSchemaFromType(value: string | string[]): string {
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "object") {
    if (Array.isArray(value) && value.length &&
      value.every((item: string) => typeof item === "string")) {
      return "array";
    }
    if (value === null) {
      return "null";
    }
    return "object";
  }
  return "unknown";
}

function extractWords(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

export function checkRequiredProps<T extends Object>(
  objectToCheck: T,
  requiredPropertiesConfig: RequiredConfig
): Errors.Result<T> {
  const validationErrors: Errors.Err[] = [];

  for (const propName in requiredPropertiesConfig) {
    if (requiredPropertiesConfig[propName].required && !(propName in objectToCheck)) {
      validationErrors.push(
        new Errors.Err(`The Property '${propName}' must be required`,{
          widget: propName,
          code: ERROR_CODE.MISSING,
        })
      );
    }
  }

  return validationErrors.length > 0
    ? new Errors.ErrResult(validationErrors)
    : Errors.okResult(objectToCheck);
}


export function checkPropsType<T extends Record<string, any>>(
  objectToCheck: T,
  requiredType: RequiredConfig
): Errors.Result<T> {
  const validationErrors: Errors.Err[] = [];

  for (const key of Object.keys(requiredType)) {
    const valueSchema = getSchemaFromType(objectToCheck[key]);

    if (
      objectToCheck[key] !== null &&
      objectToCheck[key] !== undefined &&
      valueSchema !== requiredType[key].type
    ) {
      validationErrors.push(
        new Errors.Err(
          `Property '${key}' must be ${
            requiredType[key]?.typePlaceHolder ?? requiredType[key].type
          }`,
          {
            widget: key,
            code: ERROR_CODE.BAD_TYPE,
          }
        )
      );
    }
  }

  return validationErrors.length > 0
    ? new Errors.ErrResult(validationErrors)
    : Errors.okResult(objectToCheck);
}

export function checkBadReq<T extends Record<string, any>>(
  objectToCheck: T,
  requiredType: RequiredConfig
): Errors.Result<T> {
  const validationErrors: Errors.Err[] = [];

  for (const key of Object.keys(requiredType)) {
    const value = objectToCheck[key];
    const conditions = requiredType[key].conditions;

    if (
      value !== null &&
      value !== undefined &&
      conditions?.length
    ) {
      for (const { cond, msg } of conditions) {
        if (cond(value)) {
          validationErrors.push(
            new Errors.Err(msg, {
              widget: key,
              code: ERROR_CODE.BAD_REQ,
            })
          );
        }
      }
    }
  }

  return validationErrors.length > 0
    ? new Errors.ErrResult(validationErrors)
    : Errors.okResult(objectToCheck);
}
