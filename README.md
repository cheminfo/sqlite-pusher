# sqlite-pusher
Push sqlite entries for uni-directional synchronisation. Syncs based on an incremental field of the database's table.

## Configuration
```json
[
  {
    "database": "path/to/database/file",
    "table": "table-name",
    "urls": [
      {
        "lastUrl": "",
        "pushUrl": ""
      }
    ],
    "chunkSize": 3,
    "incrCol": "id",
    "interval": 2000
  }
]
```
* ```database```: sqlite database file to push
* ```table```: name of sqlite table
* ```urls```:
 * ```lastUrl```: Send a ```GET``` request to the given url to get the state of the synchronisation (last entry's incremental column). If returns 404 the sync start at an increment of 0.
 * ```pushUrl```: Send ```PUT``` request to the given url with a json that contains the new entries
* ```incrCol``` : the name of the incremental column in the sqlite table
* ```chunkSize```: data is sent chunk by chunk with the given chunk size
* ```interval```: time interval with which to query the table to ask for new changes
