import { Errors } from 'cs544-js-utils';


/** Given a baseUrl and req, return a URL object which contains
 *  req as query-parameters appended to baseUrl.
 */
export function makeQueryUrl(baseUrl: string, req: Record<string, string>)
  : URL 
{
  const url = new URL(baseUrl);
  Object.entries(req).forEach(([k, v]) => url.searchParams.append(k, v));
  return url;
}



