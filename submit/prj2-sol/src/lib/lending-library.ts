import { Errors } from 'cs544-js-utils';

import { LibraryDao } from './library-dao.js';
import * as Lib from './library.js';
import { validate } from './library.js';

/** Note that errors are documented using the `code` option which must be
 *  returned (the `message` can be any suitable string which describes
 *  the error as specifically as possible).  Whenever possible, the
 *  error should also contain a `widget` option specifying the widget
 *  responsible for the error).
 *
 *  Note also that the underlying DAO should not normally require a
 *  sequential scan over all books or patrons.
 */


/************************ Main Implementation **************************/

export function makeLendingLibrary(dao: LibraryDao) {
  return new LendingLibrary(dao);
}

export class LendingLibrary {
  private libraryDao: LibraryDao;

  constructor(private readonly dao: LibraryDao) {
    this.libraryDao = dao;
  }

  /** clear out underlying db */
  async clear(): Promise<Errors.Result<void>> {
    return await this.libraryDao.clear();
  }

  /** Add one-or-more copies of book represented by req to this library.
   *  If the book is already in the library and consistent with the book
   *  being added, then the nCopies of the book is simply updated by
   *  the nCopies of the object being added (default 1).
   *
   *  Errors:
   *    MISSING: one-or-more of the required fields is missing.
   *    BAD_TYPE: one-or-more fields have the incorrect type.
   *    BAD_REQ: other issues, like:
   *      "nCopies" or "pages" not a positive integer.
   *      "year" is not integer in range [1448, currentYear]
   *      "isbn" is not in ISBN-10 format of the form ddd-ddd-ddd-d
   *      "title" or "publisher" field is empty.
   *      "authors" array is empty or contains an empty author
   *      book is already in library but data in req is 
   *      inconsistent with the data already present.
   */
 
  async addBook(req: Record<string, any>): Promise<Errors.Result<Lib.XBook>> {
    try {
        const validationResult = Lib.validate<Lib.XBook>('addBook', req);
        if (!validationResult.isOk) {
            return validationResult; // Return validation error if validation fails
        }

        // Check if the ISBN already exists in the database
        const searchIsbn = await this.dao.searchISBN(validationResult.val.isbn);
        if (searchIsbn.isOk) {
            // If ISBN exists, compare the book with the existing one
            const compare = compareBook(searchIsbn.val, req.isbn);
            if (compare === undefined) {
                // If books are identical, update the number of copies
                return await this.dao.changingCopies(validationResult.val.isbn, validationResult.val.nCopies) as Errors.Result<Lib.XBook>;
            } else {
                // If books are different, return an error
                return Errors.errResult(compare);
            }
        }

        const addResult = await this.dao.addBook(validationResult.val);
        return addResult;
    } catch (error) {
        return Errors.errResult(error.message, 'DB'); 
    }
}



  /** Return all books whose authors and title fields contain all
   *  "words" in req.search, where a "word" is a max sequence of /\w/
   *  of length > 1.  Note that word matching must be case-insensitive,
   *  but can depend on any stemming rules of the underlying database.
   *  
   *  The req can optionally contain non-negative integer fields
   *  index (default 0) and count (default DEFAULT_COUNT).  The
   *  returned results are a slice of the sorted results from
   *  [index, index + count).  Note that this slicing *must* be
   *  performed by the database.
   *
   *  Returned books should be sorted in ascending order by title.
   *  If no books match the search criteria, then [] should be returned.
   *
   *  Errors:
   *    MISSING: search field is missing
   *    BAD_TYPE: search field is not a string or index/count are not numbers.
   *    BAD_REQ: no words in search, index/count not int or negative.
   */

  async findBooks(req: Lib.Find): Promise<Errors.Result<Lib.XBook[]>> {
    try {
        // Validate the request
        const validatedRequest = Lib.validate<Lib.Find>("findBooks", req);
        
        // If validation fails, return the validation error
        if (!validatedRequest.isOk) {
            return validatedRequest as Errors.Result<Lib.XBook[]>;
        }
        
        // Call DAO method to find books based on the validated request
        const result = await this.dao.findBook({
            search: validatedRequest.val.search,
            index: validatedRequest.val.index || 0,
            count: validatedRequest.val.count || DEFAULT_COUNT,
        });
        
        // Return the result
        return result;
    } catch (error) {
        // If an error occurs during processing, return an internal error result
        return Errors.errResult(error.message, "INTERNAL_ERROR");
    }
}



  /** Set up patron req.patronId to check out book req.isbn. 
   * 
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ: invalid isbn or error on business rule violation, like:
   *      isbn does not specify a book in the library
   *      no copies of the book are available for checkout
   *      patron already has a copy of the same book checked out
   */


  async checkoutBook(req: Record<string, any>): Promise<Errors.Result<void>> {
    try {
        // Validate the book information
        const bookResult = Lib.validate<Lib.Book>('checkoutBook', req);
        
        // If book validation fails, return the validation error
        if (!bookResult.isOk) {
            return Errors.errResult(bookResult);
        }

        // Retrieve the book from the database
        const book = bookResult.val;
        const bookWithSameISBN = await this.dao.bookWithSameISBN(book.isbn);
        
        // If the book with the specified ISBN is not found, return a bad request error
        if (!bookWithSameISBN) {
            return Errors.errResult("ISBN does not specify a book in the library", "BAD_REQ");
        }

        // Check the availability of copies for checkout
        const availableCopies = await this.dao.getAvailableCopies(book.isbn);
        
        // If no copies are available, return a bad request error
        if (availableCopies < 1) {
            return Errors.errResult("No copies of the book are available for checkout", "BAD_REQ");
        }

        // Check if the patron has already checked out the same book
        const hasCheckedOut = await this.dao.hasPatronCheckedOut(book.isbn, req.patronId);
        
        // If the patron already has a copy checked out, return a bad request error
        if (hasCheckedOut) {
            return Errors.errResult("Patron already has a copy of the same book checked out", "BAD_REQ");
        }

        // Perform the checkout operation
        await this.dao.checkoutBook(req);

        // Return void result indicating successful checkout
        return Errors.VOID_RESULT;
    } catch (error) {
        // If an error occurs during processing, return a database error result
        return Errors.errResult(error.message, "DB");
    }
}


  /** Set up patron req.patronId to returns book req.isbn.
   *  
   *  Errors:
   *    MISSING: patronId or isbn field is missing
   *    BAD_TYPE: patronId or isbn field is not a string.
   *    BAD_REQ: invalid isbn or error on business rule violation like
   *    isbn does not specify a book in the library or there is
   *    no checkout of the book by patronId.
   */
  // async returnBook(req: Record<string, any>) : Promise<Errors.Result<void>> {
  //   return Errors.errResult('TODO');
  // }
  async returnBook(req: Record<string, any>): Promise<Errors.Result<void>> {
    try {
        // Validate the request
        const validationResult = Lib.validate<Lib.Lend>('returnBook', req);

        // If the request is not valid, return the validation error
        if (!validationResult.isOk) {
            return Errors.errResult(validationResult);
        }

        // Extract lend information from the validated request
        const lendInfo = validationResult.val;

        // Check if the book with the provided ISBN exists in the library
        const bookExists = await this.dao.bookWithSameISBN(lendInfo.isbn);

        // If the book does not exist, return a bad request error
        if (!bookExists) {
            return Errors.errResult("The provided ISBN does not match any book in the library", "BAD_REQUEST");
        }

        // Check if the patron has checked out the book
        const hasCheckedOut = await this.dao.hasPatronCheckedOut(lendInfo.isbn, lendInfo.patronId);

        // If the patron has not checked out the book, return a bad request error
        if (!hasCheckedOut) {
            return Errors.errResult("The specified patron has not checked out this book", "BAD_REQUEST");
        }

        // Perform the return operation
        await this.dao.returnBook(lendInfo);

        // Return a void result to indicate successful return
        return Errors.VOID_RESULT;
    } catch (error) {
        // If an error occurs during processing, return a database error result
        return Errors.errResult("An internal error occurred while processing the request", "DB");
    }
}
  //add class code as needed

}

// default count for find requests
const DEFAULT_COUNT = 5;

//add file level code as needed


/********************** Domain Utility Functions ***********************/

/** return a field where book0 and book1 differ; return undefined if
 *  there is no such field.
 */
function compareBook(book0: Lib.Book, book1: Lib.Book): string | undefined {
  if (book0.title !== book1.title) return 'title';
  if (book0.authors.some((a, i) => a !== book1.authors[i])) return 'authors';
  if (book0.pages !== book1.pages) return 'pages';
  if (book0.year !== book1.year) return 'year';
  if (book0.publisher !== book1.publisher) return 'publisher';
}

