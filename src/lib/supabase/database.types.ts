export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type TableDef<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<
        {
          id: string
          display_name: string | null
          created_at: string
        },
        {
          id: string
          display_name?: string | null
          created_at?: string
        },
        {
          id?: string
          display_name?: string | null
          created_at?: string
        }
      >
      boards: TableDef<
        {
          id: string
          user_id: string
          name: string
          created_at: string
        },
        {
          id?: string
          user_id: string
          name?: string
          created_at?: string
        },
        {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
        }
      >
      columns: TableDef<
        {
          id: string
          board_id: string
          slug: string
          title: string
          position: number
        },
        {
          id?: string
          board_id: string
          slug: string
          title: string
          position: number
        },
        {
          id?: string
          board_id?: string
          slug?: string
          title?: string
          position?: number
        }
      >
      projects: TableDef<
        {
          id: string
          board_id: string
          name: string
          position: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        },
        {
          id: string
          board_id: string
          name: string
          position?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        },
        {
          id?: string
          board_id?: string
          name?: string
          position?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      >
      songs: TableDef<
        {
          id: string
          board_id: string
          column_slug: string
          title: string
          notes: string
          tags: string[]
          is_favourite: boolean
          musical_key: string | null
          bpm: number | null
          position: number
          project_id: string | null
          updated_at: string
          deleted_at: string | null
        },
        {
          id: string
          board_id: string
          column_slug: string
          title: string
          notes?: string
          tags?: string[]
          is_favourite?: boolean
          musical_key?: string | null
          bpm?: number | null
          position: number
          project_id?: string | null
          updated_at?: string
          deleted_at?: string | null
        },
        {
          id?: string
          board_id?: string
          column_slug?: string
          title?: string
          notes?: string
          tags?: string[]
          is_favourite?: boolean
          musical_key?: string | null
          bpm?: number | null
          position?: number
          project_id?: string | null
          updated_at?: string
          deleted_at?: string | null
        }
      >
      audio_versions: TableDef<
        {
          id: string
          song_id: string
          storage_path: string | null
          file_name: string
          label: string
          duration_ms: number
          position: number
          updated_at: string
        },
        {
          id: string
          song_id: string
          storage_path?: string | null
          file_name: string
          label: string
          duration_ms?: number
          position: number
          updated_at?: string
        },
        {
          id?: string
          song_id?: string
          storage_path?: string | null
          file_name?: string
          label?: string
          duration_ms?: number
          position?: number
          updated_at?: string
        }
      >
      song_comments: TableDef<
        {
          id: string
          song_id: string
          board_id: string
          user_id: string
          author_label: string
          body: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        },
        {
          id: string
          song_id: string
          board_id: string
          user_id: string
          author_label?: string
          body: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        },
        {
          id?: string
          song_id?: string
          board_id?: string
          user_id?: string
          author_label?: string
          body?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      >
      external_links: TableDef<
        {
          id: string
          song_id: string
          url: string
          label: string
        },
        {
          id: string
          song_id: string
          url: string
          label?: string
        },
        {
          id?: string
          song_id?: string
          url?: string
          label?: string
        }
      >
      board_members: TableDef<
        {
          id: string
          board_id: string
          user_id: string
          role: string
          created_at: string
        },
        {
          id?: string
          board_id: string
          user_id: string
          role?: string
          created_at?: string
        },
        {
          id?: string
          board_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
      >
      board_invites: TableDef<
        {
          id: string
          board_id: string
          token: string
          created_by: string
          role: string
          invitee_email: string | null
          expires_at: string | null
          revoked_at: string | null
          created_at: string
        },
        {
          id?: string
          board_id: string
          token?: string
          created_by: string
          role?: string
          invitee_email?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        },
        {
          id?: string
          board_id?: string
          token?: string
          created_by?: string
          role?: string
          invitee_email?: string | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
      >
      waitlist: TableDef<
        {
          id: string
          email: string
          created_at: string
        },
        {
          id?: string
          email: string
          created_at?: string
        },
        {
          id?: string
          email?: string
          created_at?: string
        }
      >
      share_listen_comments: TableDef<
        {
          id: string
          share_id: string
          timestamp_ms: number
          body: string
          author_name: string
          created_at: string
        },
        {
          id?: string
          share_id: string
          timestamp_ms?: number
          body: string
          author_name?: string
          created_at?: string
        },
        {
          id?: string
          share_id?: string
          timestamp_ms?: number
          body?: string
          author_name?: string
          created_at?: string
        }
      >
      song_shares: TableDef<
        {
          id: string
          song_id: string
          board_id: string
          token: string
          created_by: string
          password_hash: string | null
          allow_download: boolean
          version_id: string | null
          created_at: string
          revoked_at: string | null
          expires_at: string | null
          listen_count: number
          last_listened_at: string | null
          view_count: number
          last_viewed_at: string | null
          label: string | null
        },
        {
          id?: string
          song_id: string
          board_id: string
          token?: string
          created_by: string
          password_hash?: string | null
          allow_download?: boolean
          version_id?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          listen_count?: number
          last_listened_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
          label?: string | null
        },
        {
          id?: string
          song_id?: string
          board_id?: string
          token?: string
          created_by?: string
          password_hash?: string | null
          allow_download?: boolean
          version_id?: string | null
          created_at?: string
          revoked_at?: string | null
          expires_at?: string | null
          listen_count?: number
          last_listened_at?: string | null
          view_count?: number
          last_viewed_at?: string | null
          label?: string | null
        }
      >
      waitlist_leads: TableDef<
        {
          id: string
          email: string
          created_at: string
        },
        {
          id?: string
          email: string
          created_at?: string
        },
        {
          id?: string
          email?: string
          created_at?: string
        }
      >
    }
    Views: Record<string, never>
    Functions: {
      accept_board_invite: {
        Args: { p_token: string }
        Returns: string
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: { board_name: string; board_id: string }[]
      }
      ensure_my_board: {
        Args: Record<string, never>
        Returns: string
      }
      create_song_share: {
        Args: {
          p_song_id: string
          p_allow_download?: boolean
          p_password?: string | null
          p_version_id?: string | null
          p_label?: string | null
        }
        Returns: string
      }
      update_song_share_label: {
        Args: { p_token: string; p_label: string }
        Returns: undefined
      }
      get_song_share_listen: {
        Args: { p_token: string; p_password?: string | null }
        Returns: Json
      }
      add_share_listen_comment: {
        Args: {
          p_token: string
          p_password?: string | null
          p_timestamp_ms: number
          p_body: string
          p_author_name?: string
        }
        Returns: string
      }
      revoke_song_share: {
        Args: { p_token: string }
        Returns: undefined
      }
      record_share_listen: {
        Args: { p_token: string }
        Returns: undefined
      }
      record_share_view: {
        Args: { p_token: string }
        Returns: undefined
      }
      renew_song_share: {
        Args: { p_token: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
