import * as dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { searchSimulator } from './search';
import { SearchParams } from './types';

dotenv.config();

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('q', {
      alias: 'query',
      type: 'string',
      description: 'Search query',
      demandOption: true
    })
    .option('gl', {
      type: 'string',
      description: 'Country code'
    })
    .option('location', {
      type: 'string',
      description: 'Specific location'
    })
    .option('hl', {
      type: 'string',
      description: 'Language code'
    })
    .option('num', {
      type: 'number',
      description: 'Number of results'
    })
    .option('page', {
      type: 'number',
      description: 'Page number'
    })
    .argv;

  const searchParams: SearchParams = {
    q: argv.q,
    gl: argv.gl,
    location: argv.location,
    hl: argv.hl,
    num: argv.num,
    page: argv.page
  };

  try {
    const results = await searchSimulator(searchParams);
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 