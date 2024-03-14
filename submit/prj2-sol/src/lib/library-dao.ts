
import * as mongo from 'mongodb';

import { Errors } from 'cs544-js-utils';

import * as Lib from './library.js';



export async function makeLibraryDao(dbUrl: string) {
  return await LibraryDao.make(dbUrl);
}

//options for new MongoClient()
const MONGO_OPTIONS = {
  ignoreUndefined: true,  //ignore undefined fields in queries
};


export class LibraryDao {

  //called by below static make() factory function with
  //parameters to be cached in this instance.
  constructor(private readonly client: mongo.MongoClient,
    private readonly library: mongo.Collection<Lib.XBook>,
    private readonly allPatrons: mongo.Collection<Lib.Lend>) {
  }

  //static factory function; should do all async operations like
  //getting a connection and creating indexing.  Finally, it
  //should use the constructor to return an instance of this class.
  //returns error code DB on database errors.
  static async make(databaseUrl: string): Promise<Errors.Result<LibraryDao>> {
    try {
      // Establish connection to the MongoDB database
      const databaseClient = await mongo.MongoClient.connect(databaseUrl, MONGO_OPTIONS);
      const database = databaseClient.db();
      
      // Get collections for books and patrons
      const library = database.collection<Lib.XBook>('allBooks');
      const patronsCollection = database.collection<Lib.Lend>('allPatrons');
      
      // Create text index on books collection
      await library.createIndex({ title: 'text', authors: 'text' });
      
      // Return a new instance of LibraryDao
      return Errors.okResult(new LibraryDao(databaseClient, library, patronsCollection));
    } catch (error) {
      // Return error code DB on database errors
      return Errors.errResult(error.message, 'DB');
    }
  }

  /** close off this DAO; implementing object is invalid after 
   *  call to close() 
   *
   *  Error Codes: 
   *    DB: a database error was encountered.
   */
  async close(): Promise<Errors.Result<void>> {
    try {
      // Close the MongoDB connection
      await this.client.close();
      return Errors.VOID_RESULT;
    } catch (error) {
      return Errors.errResult(error.message, 'DB');
    }
  }

  /** clear all data in this DAO.
   *
   *  Error Codes: 
   *    DB: a database error was encountered.
   */
  async clear(): Promise<Errors.Result<void>> {
    try {
      await this.library.deleteMany({});
      return Errors.VOID_RESULT;
    }
    catch (e) {
      return Errors.errResult(e.message, 'DB');
    }
  }

  //add methods as per your API
  async bookWithSameISBN(isbn: string): Promise<Lib.XBook> {
    const foundBook = await this.library.findOne({ isbn });
    if (foundBook) {
      return foundBook;
    }
  }  

  async addBook(book: Lib.XBook): Promise<Errors.Result<Lib.XBook>> {
    try {
      const insertion = await this.library.insertOne(book);
      if (insertion.acknowledged) {
        return Errors.okResult(book);
      }
      return Errors.errResult("Failed to add the book to the database", "DB");
    } catch (error) {
      return Errors.errResult("An error occurred while adding the book: " + error.message, "DB");
    }
  }  

  async findBook(Find: {search: string; index: number; count: number;}): Promise<Errors.Result<Lib.Book[]>> 
  {
    try {
      // Prepare search query by splitting and formatting search terms
      const searchWords = '"'+ Find.search.toLowerCase().split(/\W+/).join('" "')+'"' ; 

      // Split search query into keywords
      const searchBooks = await this.library.find({ $text: { $search: searchWords } }, { projection: {  _id: 0 } });

      const books = await searchBooks.sort({ title: 1 }).skip(Find.index).limit(Find.count).toArray();

      return Errors.okResult(books);
    } 
    catch (err) 
    {
      return Errors.errResult(err.message, 'DB');
    }
  }

  async searchISBN(isbn: string): Promise<Errors.Result<Lib.XBook>> {
    try {
        // Attempt to find a book in the library using the provided ISBN
        const book = await this.library.findOne({ isbn: isbn });

         // Check if a book is found
        if (book) 
        {
            return Errors.okResult(book);
        } 
        else  // Return an error result if no book is found with the provided ISBN
        {
            return Errors.errResult(`No book found with ISBN '${isbn}'`, { code: 'NOT_FOUND' });
        }
    } 
    catch (err) 
    {
        return Errors.errResult((err as Error).message, 'DB');
    }
}

  async checkoutBook(checkOutReq: Lib.Lend): Promise<Errors.Result<void>> {
    try {
      // Destructure ISBN and patron ID from the checkout request object
      const { isbn, patronId } = checkOutReq;

      // Insert the checkout information into the database
      const checkoutResult = await this.allPatrons.insertOne({ isbn, patronId });

      // If the checkout operation is acknowledged, return void result
      if (checkoutResult.acknowledged) {
        return Errors.VOID_RESULT;
      }

      // Return an error result if the checkout operation fails
      return Errors.errResult("Failed to checkout book", "DB");
    } catch (error) {
      // Return an error result in case of any exceptions
      return Errors.errResult(error.message, "DB");
    }
  }


  async getAvailableCopies(bookId: string): Promise<number> {
    try {
        const checkedOutPatrons = await this.allPatrons.find({ isbn: bookId }).toArray();
        const totalCopies = (await this.bookWithSameISBN(bookId)).nCopies;
        return totalCopies - checkedOutPatrons.length;
    } catch (error) {
        // Handle errors gracefully
        console.error("Error in getAvailableCopies:", error);
        return -1; // Indicate error with a negative value
    }
}

async hasPatronCheckedOut(bookId: string, patronId: string): Promise<boolean> {
  try {
      const patron = await this.allPatrons.findOne({ isbn: bookId, patronId: patronId });
      return !!patron; // Convert to boolean
  } catch (error) {
      // Handle errors gracefully
      console.error("Error in hasPatronCheckedOut:", error);
      return false; // Default to false in case of error
  }
}

  async returnBook(returnReq: Lib.Lend): Promise<Errors.Result<void>> {
    try {
      // Destructure ISBN and patron ID from the return request object
      const { isbn, patronId } = returnReq;

      // Delete the return information from the database
      const returnResult = await this.allPatrons.deleteOne({ isbn, patronId });

      // If the return operation is acknowledged, return void result
      if (returnResult.acknowledged) {
        return Errors.VOID_RESULT;
      }

      // Return an error result if the return operation fails
      return Errors.errResult("Failed to return book", "DB");

    } catch (error) {
      // Return an error result in case of any exceptions
      return Errors.errResult(error.message, "DB");
    }
  }

  async changingCopies(isbn: string, extraCopies: number): Promise<Errors.Result<void>> {
    try {
        // Perform an inventory update operation for the specified book ISBN
        const updateResult = await this.library.updateOne(
            { isbn: isbn },
            { $inc: { nCopies: extraCopies } }
        );

        // Check if any book matches the given ISBN for the inventory update
        if (updateResult.matchedCount === 0) {
            // Return an error result if no book is found with the provided ISBN
            return Errors.errResult(`The book with ISBN '${isbn}' does not exist`, { code: 'NOT_FOUND' });
        }

        // Return a success result if the inventory adjustment operation is successful
        return Errors.okResult(undefined);
    } catch (error) {
        // Return a database error result if any error occurs during the inventory update
        return Errors.errResult(error.message, 'DATABASE');
    }
}

} //class LibDao