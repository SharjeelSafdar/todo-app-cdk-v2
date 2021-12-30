import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamoDb from "aws-cdk-lib/aws-dynamodb";
import * as appsync from "@aws-cdk/aws-appsync-alpha";

export class TodoAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ddbTable = new dynamoDb.Table(this, "my-ddb-table", {
      tableName: "todos-cdk-v2",
      partitionKey: {
        name: "id",
        type: dynamoDb.AttributeType.STRING,
      },
      billingMode: dynamoDb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const graphqlApi = new appsync.GraphqlApi(this, "my-appsync-api", {
      name: "todo-cdk-v2",
      schema: appsync.Schema.fromAsset("graphql/schema.gql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
          },
        },
      },
    });

    const ddbDataSource = graphqlApi.addDynamoDbDataSource(
      "ddbDataSourceCdkV2",
      ddbTable
    );
    ddbTable.grantReadWriteData(ddbDataSource);

    ddbDataSource.createResolver({
      typeName: "Query",
      fieldName: "todos",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    ddbDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "createTodo",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting()
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    ddbDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "editTodoContent",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "operation": "UpdateItem",
          "key": {
            "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
          },
          "update": {
            "expression": "SET #oldContent = :newContent",
            "expressionNames": {
              "#oldContent": "content"
            },
            "expressionValues": {
              ":newContent": $util.dynamodb.toDynamoDBJson($ctx.args.newContent)
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    ddbDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "toggleTodoStatus",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2017-02-28",
          "operation": "UpdateItem",
          "key": {
            "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
          },
          "update": {
            "expression": "SET #oldStatus = :newStatus",
            "expressionNames": {
              "#oldStatus": "status"
            },
            "expressionValues": {
              ":newStatus": $util.dynamodb.toDynamoDBJson($ctx.args.newStatus)
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    ddbDataSource.createResolver({
      typeName: "Mutation",
      fieldName: "deleteTodo",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbDeleteItem(
        "id",
        "id"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
  }
}
