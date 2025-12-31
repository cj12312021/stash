"""
Stash GraphQL API interface for the Performer Auto-Tagger plugin.
"""
import requests
from typing import Optional, List, Dict, Any
import log


class StashInterface:
    """Client for interacting with the Stash GraphQL API."""
    
    def __init__(self, conn: Dict[str, Any]):
        """
        Initialize the Stash interface.
        
        Args:
            conn: Connection info from plugin input containing Port, Scheme, SessionCookie, etc.
        """
        self.port = conn.get('Port', 9999)
        scheme = conn.get('Scheme', 'http')
        host = conn.get('Host', 'localhost')
        
        self.url = f"{scheme}://{host}:{self.port}/graphql"
        self.base_url = f"{scheme}://{host}:{self.port}"
        
        self.headers = {
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        # Session cookie for authentication
        self.cookies = {}
        session_cookie = conn.get('SessionCookie')
        if session_cookie and isinstance(session_cookie, dict):
            self.cookies['session'] = session_cookie.get('Value', '')
        
        # API key authentication (alternative)
        api_key = conn.get('ApiKey')
        if api_key:
            self.headers['ApiKey'] = api_key

    def call_graphql(self, query: str, variables: Optional[Dict] = None) -> Dict:
        """
        Execute a GraphQL query/mutation.
        
        Args:
            query: The GraphQL query string
            variables: Optional variables for the query
            
        Returns:
            The data portion of the response
            
        Raises:
            Exception: If the query fails
        """
        json_payload = {'query': query}
        if variables:
            json_payload['variables'] = variables
        
        response = requests.post(
            self.url, 
            json=json_payload, 
            headers=self.headers, 
            cookies=self.cookies
        )
        
        if response.status_code != 200:
            raise Exception(f"GraphQL query failed: {response.status_code} - {response.content}")
        
        result = response.json()
        
        if 'errors' in result:
            errors = result['errors']
            raise Exception(f"GraphQL errors: {errors}")
        
        return result.get('data', {})

    def get_all_performers(self, page: int = 1, per_page: int = 100) -> Dict:
        """Get all performers with pagination."""
        query = """
        query FindPerformers($filter: FindFilterType) {
            findPerformers(filter: $filter) {
                count
                performers {
                    id
                    name
                    image_path
                    tags {
                        id
                        name
                    }
                }
            }
        }
        """
        variables = {
            "filter": {
                "page": page,
                "per_page": per_page,
                "sort": "name",
                "direction": "ASC"
            }
        }
        return self.call_graphql(query, variables)['findPerformers']

    def get_performer_by_id(self, performer_id: str) -> Optional[Dict]:
        """Get a specific performer by ID with all fields."""
        query = """
        query FindPerformer($id: ID!) {
            findPerformer(id: $id) {
                id
                name
                image_path
                gender
                ethnicity
                eye_color
                hair_color
                measurements
                fake_tits
                tattoos
                piercings
                height_cm
                weight
                tags {
                    id
                    name
                }
            }
        }
        """
        result = self.call_graphql(query, {"id": performer_id})
        return result.get('findPerformer')

    def get_images_for_performer(self, performer_id: str, limit: int = 10) -> List[Dict]:
        """
        Get images associated with a performer.
        
        Args:
            performer_id: The performer's ID
            limit: Maximum number of images to return
            
        Returns:
            List of image objects with paths
        """
        query = """
        query FindImages($image_filter: ImageFilterType, $filter: FindFilterType) {
            findImages(image_filter: $image_filter, filter: $filter) {
                count
                images {
                    id
                    title
                    paths {
                        image
                        thumbnail
                    }
                }
            }
        }
        """
        variables = {
            "image_filter": {
                "performers": {
                    "value": [performer_id],
                    "modifier": "INCLUDES"
                }
            },
            "filter": {
                "per_page": limit,
                "sort": "random"
            }
        }
        result = self.call_graphql(query, variables)
        return result['findImages']['images']

    def get_performer_profile_image(self, performer: Dict) -> Optional[str]:
        """
        Get the performer's profile image URL.
        
        Args:
            performer: Performer object with image_path
            
        Returns:
            Full URL to the performer's image, or None
        """
        image_path = performer.get('image_path')
        if image_path:
            # image_path is typically a relative path, need to make it absolute
            if image_path.startswith('http'):
                return image_path
            return f"{self.base_url}{image_path}"
        return None

    def find_tag_by_name(self, name: str) -> Optional[Dict]:
        """Find a tag by exact name match."""
        query = """
        query FindTags($tag_filter: TagFilterType) {
            findTags(tag_filter: $tag_filter) {
                tags {
                    id
                    name
                }
            }
        }
        """
        variables = {
            "tag_filter": {
                "name": {
                    "value": name,
                    "modifier": "EQUALS"
                }
            }
        }
        result = self.call_graphql(query, variables)
        tags = result['findTags']['tags']
        return tags[0] if tags else None

    def create_tag(self, name: str) -> Dict:
        """Create a new tag."""
        mutation = """
        mutation TagCreate($input: TagCreateInput!) {
            tagCreate(input: $input) {
                id
                name
            }
        }
        """
        variables = {"input": {"name": name}}
        return self.call_graphql(mutation, variables)['tagCreate']

    def find_or_create_tag(self, name: str) -> str:
        """
        Find a tag by name, or create it if it doesn't exist.
        
        Args:
            name: The tag name
            
        Returns:
            The tag ID
        """
        existing = self.find_tag_by_name(name)
        if existing:
            return existing['id']
        
        log.info(f"Creating new tag: {name}")
        new_tag = self.create_tag(name)
        return new_tag['id']

    def update_performer_tags(self, performer_id: str, tag_ids: List[str]) -> Dict:
        """
        Update a performer's tags.
        
        Args:
            performer_id: The performer's ID
            tag_ids: List of tag IDs to assign
            
        Returns:
            Updated performer object
        """
        mutation = """
        mutation PerformerUpdate($input: PerformerUpdateInput!) {
            performerUpdate(input: $input) {
                id
                name
                tags {
                    id
                    name
                }
            }
        }
        """
        variables = {
            "input": {
                "id": performer_id,
                "tag_ids": tag_ids
            }
        }
        return self.call_graphql(mutation, variables)['performerUpdate']

    def update_performer_fields(self, performer_id: str, fields: Dict[str, Any]) -> Dict:
        """
        Update a performer's fields (attributes like eye_color, hair_color, etc).
        
        Args:
            performer_id: The performer's ID
            fields: Dict of field names to values
            
        Returns:
            Updated performer object
        """
        mutation = """
        mutation PerformerUpdate($input: PerformerUpdateInput!) {
            performerUpdate(input: $input) {
                id
                name
                gender
                ethnicity
                eye_color
                hair_color
                measurements
                fake_tits
                tattoos
                piercings
            }
        }
        """
        # Build input with performer ID and fields
        input_data = {"id": performer_id}
        input_data.update(fields)
        
        variables = {"input": input_data}
        return self.call_graphql(mutation, variables)['performerUpdate']

    def get_plugin_setting(self, plugin_id: str, setting_name: str) -> Any:
        """Get a plugin configuration setting."""
        query = """
        query Configuration {
            configuration {
                plugins
            }
        }
        """
        result = self.call_graphql(query)
        plugins = result.get('configuration', {}).get('plugins', {})
        plugin_config = plugins.get(plugin_id, {})
        return plugin_config.get(setting_name)

