const DB_NAME = 'immerse-reader'
const STORE_NAME = 'books'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function storedBook(book) {
  const { file, handle, ...record } = book
  return record
}

export async function listStoredBooks() {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      database.close()
      resolve(request.result.sort((a, b) => new Date(b.lastReadAt || 0) - new Date(a.lastReadAt || 0)))
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}

export async function saveStoredBook(book) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(storedBook(book))
    request.onsuccess = () => {
      database.close()
      resolve()
    }
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
  })
}
