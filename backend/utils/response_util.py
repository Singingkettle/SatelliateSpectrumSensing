"""
Utility functions for API responses.
"""
from flask import jsonify


def success_response(data=None, message=None, status_code=200):
    """
    Create a standardized success response.
    
    Args:
        data: Response data (dict or list)
        message: Optional success message
        status_code: HTTP status code (default: 200)
    
    Returns:
        Flask response tuple
    """
    response = {'status': 'success'}
    
    if message:
        response['message'] = message
    
    if data is not None:
        response['data'] = data
    
    return jsonify(response), status_code


def error_response(message, status_code=400, errors=None):
    """
    Create a standardized error response.
    
    Args:
        message: Error message
        status_code: HTTP status code (default: 400)
        errors: Optional list of detailed errors
    
    Returns:
        Flask response tuple
    """
    response = {
        'status': 'error',
        'message': message,
    }
    
    if errors:
        response['errors'] = errors
    
    return jsonify(response), status_code


def paginated_response(items, total, offset, limit):
    """
    Create a standardized paginated response.
    
    Args:
        items: List of items for current page
        total: Total count of items
        offset: Current offset
        limit: Items per page
    
    Returns:
        Dictionary with pagination metadata
    """
    return {
        'items': items,
        'total': total,
        'offset': offset,
        'limit': limit,
        'has_more': offset + len(items) < total,
    }
