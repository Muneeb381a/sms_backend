import { pool } from "../config/db.js";
import logger from "../services/logger.js";


const getAllClasses = async (req, res, next) => {
    try {
        // Query to fetch all classes
        const result = await pool.query('SELECT * FROM classes ORDER BY created_at DESC');
        
        // Log the number of classes retrieved
        logger.info(`Retrieved ${result.rows.length} classes from the database`);
    
        // Check if no classes were found
        if (result.rows.length === 0) {
          return res.status(200).json({
            status: 'success',
            message: 'No classes found',
            data: [],
          });
        }
    
        // Return the list of classes
        res.status(200).json({
          status: 'success',
          message: 'Classes retrieved successfully',
          data: result.rows,
        });
      } catch (error) {
        // Log the error
        logger.error(`Error fetching classes: ${error.stack}`);
        
        // Pass the error to the global error handler
        const err = new Error('Failed to fetch classes');
        err.status = 500;
        next(err);
      }
};

export {getAllClasses}