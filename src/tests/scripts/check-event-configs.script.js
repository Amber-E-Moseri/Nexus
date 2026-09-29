import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('Event Configs Schema Check', () => {
  it('should inspect event_configs table structure', async () => {
    const supabase = createClient(
      'http://127.0.0.1:54321',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MzAwMDAwMDAsImV4cCI6MTkzMDAwMDAwMH0.DHxHnqQx5aXV_-dYVZM5Z_MBVmBphL5zZLqg5_DwXoQ'
    )

    // Get schema
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', 'event_configs')
      .order('ordinal_position')

    console.log('EVENT_CONFIGS COLUMNS:')
    columns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
    })

    // Get sample rows
    const { data: rows } = await supabase
      .from('event_configs')
      .select('*')
      .limit(2)

    console.log('\nSAMPLE ROWS:')
    console.log(JSON.stringify(rows, null, 2))

    expect(columns).toBeDefined()
    expect(rows).toBeDefined()
  })
})
